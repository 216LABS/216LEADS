// After the send: provider webhooks (spec 10.2), homeowner opt-out (issue #2), metered billing
// (spec 10.4) and auto-mail rules with caps and follow-ups (spec 9.5).
import { createElement } from "react";
import type { Sql } from "@216leads/db";
import { optionalEnv } from "@216leads/db";
import { appUrl, AutoMailSummary, sendEmail } from "@216leads/email";
import { assertKeyAllowed, normalizeAddress, POSTCARD_PRICE_CENTS, zip5 } from "@216leads/shared";
import { withJobRun } from "../runtime";
import type { MailEvent, MailProvider } from "./provider";
import { commitSend, planSend } from "./send";

/** Apply one verified provider event. Returned mail suppresses the address for everyone. */
export async function applyMailEvent(sql: Sql, provider: string, ev: MailEvent): Promise<string> {
  const [p] = await sql<{ id: string; parcel_key: string; status: string }[]>`
    select id, parcel_key, status from mail_piece where provider = ${provider} and provider_id = ${ev.providerId}`;
  if (!p) return "unknown_piece";
  if (ev.status === "unknown") return "ignored";
  await sql`
    update mail_piece set status = case when status = 'canceled' then status else ${ev.status} end,
      events = events || ${sql.json([{ status: ev.status, at: ev.at, raw: ev.raw }])}
    where id = ${p.id}`;
  if (ev.status === "returned") {
    await sql`
      insert into suppression (addr_norm, parcel_key, reason)
      select addr_norm, parcel_key, 'returned_mail' from parcel where parcel_key = ${p.parcel_key}
      on conflict (addr_norm) do nothing`;
  }
  return ev.status;
}

/**
 * Homeowner opt-out (issue #2): suppress the address for every org right away and cancel queued
 * pieces still inside their window. The caller gives the same answer whether or not it matched.
 */
export async function optOut(sql: Sql, street: string, zip: string, provider: MailProvider): Promise<{ matched: boolean; canceled: number }> {
  const n = normalizeAddress(street, zip5(zip));
  if (!n.houseNo || !n.street || !n.zip5) return { matched: false, canceled: 0 };
  const [parcel] = await sql<{ parcel_key: string }[]>`select parcel_key from parcel where addr_norm = ${n.addrNorm} order by parcel_key limit 1`;
  await sql`
    insert into suppression (addr_norm, parcel_key, reason) values (${n.addrNorm}, ${parcel?.parcel_key ?? null}, 'homeowner_request')
    on conflict (addr_norm) do update set parcel_key = coalesce(suppression.parcel_key, excluded.parcel_key)`;
  let canceled = 0;
  if (parcel) {
    const queued = await sql<{ id: string; provider_id: string | null; org_id: string; billed_via: string }[]>`
      select id, provider_id, org_id, billed_via from mail_piece
      where parcel_key = ${parcel.parcel_key} and status in ('queued', 'submitted') and send_after > now()`;
    for (const q of queued) {
      if (q.provider_id) await provider.cancel(q.provider_id).catch(() => undefined);
      await sql`update mail_piece set status = 'canceled', canceled_at = now() where id = ${q.id}`;
      if (q.billed_via === "credit") await sql`update org set postcard_credits = postcard_credits + 1 where id = ${q.org_id}`;
      canceled++;
    }
    // Hidden from every org's list now, not at the next re-score.
    await sql`delete from lead where parcel_key = ${parcel.parcel_key} and status = 'new' and first_touch_at is null`;
  }
  return { matched: !!parcel, canceled };
}

/**
 * Report metered pieces to the Stripe meter once their cancel window has passed (spec 10.4).
 * Without a Stripe key the pieces stay unreported (nothing is billed).
 */
export async function reportMeteredPostcards(sql: Sql): Promise<number> {
  const key = optionalEnv("STRIPE_SECRET_KEY");
  if (!key) return 0;
  assertKeyAllowed("stripe", key);
  const meter = optionalEnv("STRIPE_METER_POSTCARDS") ?? "postcards_sent";
  const due = await sql<{ id: string; customer: string; at: Date }[]>`
    select m.id, o.stripe_customer_id as customer, m.send_after as at from mail_piece m join org o on o.id = m.org_id
    where m.billed_via = 'metered' and m.metered_reported_at is null and m.send_after <= now()
      and m.status not in ('canceled', 'failed') and o.stripe_customer_id is not null
    limit 500`;
  let n = 0;
  for (const d of due) {
    const body = new URLSearchParams({
      event_name: meter, identifier: d.id, timestamp: String(Math.floor(d.at.getTime() / 1000)),
      "payload[stripe_customer_id]": d.customer, "payload[value]": "1",
    });
    const res = await fetch("https://api.stripe.com/v1/billing/meter_events", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    // 400 "already exists" means a previous run reported it (identifier is unique).
    if (res.ok || res.status === 400) {
      await sql`update mail_piece set metered_reported_at = now() where id = ${d.id}`;
      n++;
    }
  }
  return n;
}

interface Rule { id: string; org_id: string; template_id: string; min_score: number; trigger_kinds: string[]; max_per_week: number; monthly_cap_cents: number; followup_days: number[] }

/**
 * Auto-mail (spec 9.5, 13): for each enabled rule, mail new homes at min_score+ whose trigger
 * matches, inside the weekly count and monthly $ cap, never before a lead is visible, and never
 * for locked or canceled accounts. Follow-ups re-mail homes still open N days after the first card.
 */
export async function runAutomail(sql: Sql, provider: MailProvider, o: { now?: Date } = {}) {
  return withJobRun(sql, { job: "automail" }, async (ctx) => {
    const rules = await sql<Rule[]>`
      select r.id, r.org_id, r.template_id, r.min_score, r.trigger_kinds::text[] as trigger_kinds, r.max_per_week, r.monthly_cap_cents, r.followup_days
      from mail_rule r join org o on o.id = r.org_id
      where r.enabled and o.billing_state in ('trialing', 'active', 'past_due')`;
    let sent = 0;
    for (const r of rules) {
      const [wk] = await sql<{ n: number }[]>`
        select count(*)::int as n from mail_piece where rule_id = ${r.id} and status <> 'canceled' and created_at > now() - interval '7 days'`;
      const room = Math.max(0, r.max_per_week - (wk?.n ?? 0));
      if (!room) continue;
      const labels = r.trigger_kinds.map((k) => (k === "sale" ? "%sold%" : k === "violation" ? "%citation%" : k === "permit" ? "%permit%" : `%${k}%`));
      const fresh = await sql<{ id: string }[]>`
        select l.id from lead l
        where l.org_id = ${r.org_id} and l.status = 'new' and not l.hidden and l.visible_from <= now()
          and l.score >= ${r.min_score} and l.trigger_date >= current_date - 14
          and l.trigger_label ilike any(${labels})
          and not exists (select 1 from mail_piece m where m.org_id = l.org_id and m.parcel_key = l.parcel_key)
        order by l.score desc, l.trigger_date desc limit ${room}`;
      const followups = r.followup_days.length
        ? await sql<{ id: string; piece: string }[]>`
            select distinct on (l.id) l.id, m.id as piece from mail_piece m join lead l on l.id = m.lead_id
            where m.rule_id = ${r.id} and m.followup_of is null and m.status not in ('canceled', 'failed', 'returned')
              and (current_date - (m.created_at at time zone 'America/New_York')::date) = any(${r.followup_days}::int[])
              and l.status in ('new', 'contacted')
              and not exists (select 1 from mail_piece f where f.followup_of = m.id)`
        : [];
      for (const [ids, followOf] of [[fresh.map((f) => f.id), null], ...followups.map((f) => [[f.id], f.piece] as const)] as [string[], string | null][]) {
        if (!ids.length) continue;
        const req = { orgId: r.org_id, leadIds: ids, templateId: r.template_id, ruleId: r.id, capCents: r.monthly_cap_cents, followup: !!followOf };
        const plan = await planSend(sql, req);
        if (!plan.pieces.length) continue;
        const res = await commitSend(sql, req, plan, provider);
        if (followOf) await sql`update mail_piece set followup_of = ${followOf} where batch_id = ${res.batchId}`;
        sent += res.queued;
      }
    }
    ctx.rowsUpserted = sent;
    ctx.meta.sent = sent;
    ctx.meta.metered_reported = await reportMeteredPostcards(sql);
    // Monday: last week's auto-mail summary per org (spec 12).
    const now = o.now ?? new Date();
    if (new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(now) === "Mon") {
      const orgs = await sql<{ org_id: string; sent: number; cents: number }[]>`
        select m.org_id, count(*)::int as sent, coalesce(sum(m.price_cents), 0)::int as cents from mail_piece m
        where m.rule_id is not null and m.status not in ('canceled', 'failed') and m.created_at > now() - interval '7 days' group by m.org_id`;
      const week = now.toISOString().slice(0, 10);
      for (const g of orgs) {
        const owners = await sql<{ email: string }[]>`
          select u.email::text from org_member m join auth.users u on u.id = m.user_id where m.org_id = ${g.org_id} and m.role = 'owner'`;
        await sendEmail(sql, {
          orgId: g.org_id, kind: "automail_summary", dedupeKey: `automail_summary:${g.org_id}:${week}`, to: owners.map((x) => x.email),
          subject: `Auto-mail sent ${g.sent} postcard${g.sent === 1 ? "" : "s"} this week`,
          element: createElement(AutoMailSummary, { sent: g.sent, skipped: 0, spentText: g.cents ? `$${(g.cents / 100).toFixed(2)} beyond credits` : "all from credits", mailUrl: appUrl("/mail") }),
        });
      }
    }
  });
}

export { POSTCARD_PRICE_CENTS };
