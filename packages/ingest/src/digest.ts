// Weekly digest and lifecycle email jobs (spec 12). Both run hourly from the scheduler and are
// idempotent through email_log, so a missed or repeated run never double-sends.
import { createElement } from "react";
import type { Sql } from "@216leads/db";
import {
  appUrl, Digest, digestSubject, sendEmail, TrialDay3, trialDay3Subject, TrialEnding, unsubscribeToken, type DigestProps,
} from "@216leads/email";
import { TRADE_CATEGORY } from "@216leads/scoring";
import { addDays, titleCase, tradeLabel, TZ } from "@216leads/shared";
import { withJobRun } from "./runtime";
import { grantMonthlyCredits, refreshBillingStates } from "./billing";

const TRIGGER_CHIPS: { label: string; match: RegExp; chip: string }[] = [
  { label: "Just sold", match: /sold|moved/i, chip: "sold" },
  { label: "Neighbors", match: /neighbor/i, chip: "neighbors" },
  { label: "City citation", match: /citation/i, chip: "citation" },
];

/** ET weekday (0 = Sunday), hour and ISO week key for a moment. */
export function etClock(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday!);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  // ISO week of the ET date.
  const d = new Date(`${date}T12:00:00Z`);
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const jan4 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thursday.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return { day, hour: Number(parts.hour), date, week: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}` };
}

/** The digest for one org, or null when there is nothing on the list. Recipient-independent. */
export async function buildDigest(sql: Sql, orgId: string): Promise<Omit<DigestProps, "unsubscribeUrl"> | null> {
  const [org] = await sql<{ name: string; trade: string }[]>`select name, trade from org where id = ${orgId}`;
  if (!org) return null;
  const visible = sql`l.org_id = ${orgId} and not l.hidden and l.visible_from <= now() and l.status in ('new', 'contacted', 'quoted')`;
  const [c] = await sql<{ total: number; fresh: number }[]>`
    select count(*)::int as total,
      count(*) filter (where l.first_surfaced_at >= now() - interval '7 days' or l.trigger_date >= current_date - 7)::int as fresh
    from lead l where ${visible}`;
  if (!c?.total) return null;
  const top = await sql<{ id: string; addr_line: string; city: string; score: number; reasons: { label: string }[]; trigger_label: string | null }[]>`
    select l.id, p.addr_line, p.city, l.score, l.reasons, l.trigger_label
    from lead l join parcel p on p.parcel_key = l.parcel_key
    where ${visible} and l.status = 'new'
    order by (l.trigger_date >= current_date - 7) desc nulls last, l.score desc, p.addr_line
    limit 10`;
  const towns = await sql<{ city: string }[]>`
    select p.city from lead l join parcel p on p.parcel_key = l.parcel_key where ${visible}
    group by p.city order by count(*) desc limit 1`;
  const trig = await sql<{ trigger_label: string; n: number }[]>`
    select l.trigger_label, count(*)::int as n from lead l
    where ${visible} and l.trigger_label is not null and l.trigger_date >= current_date - 7 group by l.trigger_label`;
  const category = TRADE_CATEGORY[org.trade] ?? org.trade;
  // Competitor of the week: the business pulling the most permits in this trade in the area (spec 12).
  const [comp] = await sql<{ name: string; n: number }[]>`
    select c.display_name as name, count(*)::int as n
    from parcel_event e join contractor c on c.id = e.contractor_id
    where e.kind = 'permit' and e.category = ${category} and e.event_date >= current_date - 7 and not c.is_individual
      and e.parcel_key in (select org_territory_parcels(${orgId}))
    group by c.display_name order by n desc, c.display_name limit 1`;
  const triggers = TRIGGER_CHIPS.map((t) => ({
    label: t.label,
    count: trig.filter((r) => t.match.test(r.trigger_label)).reduce((s, r) => s + r.n, 0),
    url: appUrl(`/leads?chips=${t.chip}`),
  })).filter((t) => t.count > 0);
  return {
    orgName: org.name,
    trade: org.trade,
    topTown: titleCase(towns[0]?.city ?? "your area"),
    total: c.total,
    newThisWeek: c.fresh,
    leads: top.map((l) => ({
      url: appUrl(`/leads/${l.id}`), address: titleCase(l.addr_line), town: titleCase(l.city), score: l.score,
      reason: l.reasons[0]?.label ?? null, trigger: l.trigger_label,
    })),
    triggers,
    competitor: comp ? { name: comp.name, count: comp.n } : null,
    leadsUrl: appUrl("/leads"),
  };
}

async function recipients(sql: Sql, orgId: string, digestEmails: string[]): Promise<string[]> {
  if (digestEmails.length) return digestEmails;
  const owners = await sql<{ email: string }[]>`
    select u.email::text from org_member m join auth.users u on u.id = m.user_id where m.org_id = ${orgId} and m.role = 'owner'`;
  return owners.map((o) => o.email);
}

/**
 * Send this week's digest to every org whose digest day is today (ET), from 06:00 ET on (spec 12).
 * `force` sends regardless of day and hour (manual runs, tests); each address still gets one per week.
 */
export async function runDigest(sql: Sql, o: { org?: string; force?: boolean; now?: Date } = {}) {
  return withJobRun(sql, { job: "digest" }, async (ctx) => {
    const clock = etClock(o.now ?? new Date());
    const orgs = await sql<{ id: string; digest_day: number; digest_emails: string[] }[]>`
      select id, digest_day, digest_emails::text[] as digest_emails from org
      where digest_enabled and onboarded_at is not null and billing_state in ('trialing', 'active', 'past_due')
        and (${o.org ?? null}::uuid is null or id = ${o.org ?? null}::uuid)`;
    let sent = 0;
    let skipped = 0;
    for (const org of orgs) {
      if (!o.force && (org.digest_day !== clock.day || clock.hour < 6)) continue;
      const d = await buildDigest(sql, org.id);
      if (!d) {
        skipped++;
        continue;
      }
      for (const to of await recipients(sql, org.id, org.digest_emails)) {
        const unsubscribeUrl = appUrl(`/api/public/unsubscribe?t=${unsubscribeToken(org.id, to)}`);
        const res = await sendEmail(sql, {
          orgId: org.id, kind: "digest", dedupeKey: `digest:${org.id}:${clock.week}:${to.toLowerCase()}`, to: [to],
          subject: digestSubject(d), element: createElement(Digest, { ...d, unsubscribeUrl }), stream: "digest",
          headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        });
        if (res) sent++;
      }
    }
    ctx.rowsUpserted = sent;
    ctx.meta.sent = sent;
    ctx.meta.empty = skipped;
    ctx.meta.week = clock.week;
  });
}

/**
 * Day-3 trial check-in (issue #8): from 09:00 ET on the third day after the org was created, to
 * each owner who hasn't opted out of lifecycle email. Orgs with no homes yet are listed in the
 * job run for a manual look instead.
 */
async function sendDay3(sql: Sql, now: Date) {
  const clock = etClock(now);
  if (clock.hour < 9) return { sent: 0, noHomes: [] as string[] };
  const created = addDays(clock.date, -3);
  const orgs = await sql<{ id: string; trade: string }[]>`
    select id, trade from org
    where billing_state = 'trialing' and onboarded_at is not null
      and (created_at at time zone ${TZ})::date = ${created}::date`;
  let sent = 0;
  const noHomes: string[] = [];
  for (const org of orgs) {
    const top = await sql<{ id: string; addr_line: string; city: string; score: number; reasons: { label: string }[] }[]>`
      select l.id, p.addr_line, p.city, l.score, l.reasons from lead l join parcel p on p.parcel_key = l.parcel_key
      where l.org_id = ${org.id} and not l.hidden and l.visible_from <= now() and l.status = 'new'
      order by l.score desc, p.addr_line limit 3`;
    if (!top.length) {
      noHomes.push(org.id);
      continue;
    }
    const owners = await sql<{ user_id: string; email: string }[]>`
      select m.user_id, u.email::text from org_member m join auth.users u on u.id = m.user_id
      where m.org_id = ${org.id} and m.role = 'owner'
        and not exists (select 1 from email_optout x where x.email = u.email and x.stream = 'lifecycle')`;
    const label = tradeLabel(org.trade);
    const trade = label === label.toUpperCase() ? label : label.toLowerCase();
    const town = titleCase(top[0]!.city);
    for (const o of owners) {
      const res = await sendEmail(sql, {
        orgId: org.id, kind: "trial_day3", dedupeKey: `trial_day3:${o.user_id}`, to: [o.email],
        subject: trialDay3Subject({ trade, town }), replyTo: "sam@216labs.dev",
        element: createElement(TrialDay3, {
          trade, town,
          homes: top.map((h) => ({ address: titleCase(h.addr_line), score: h.score, reason: h.reasons[0]?.label ?? null, url: appUrl(`/leads/${h.id}`) })),
          unsubscribeUrl: appUrl(`/api/public/unsubscribe?t=${unsubscribeToken(org.id, o.email, "lifecycle")}`),
        }),
      });
      if (res) sent++;
    }
  }
  return { sent, noHomes };
}

/** Lifecycle mail: day-3 check-in and trial ending on day 11 of 14 (spec 12). Payment-failed goes out from the Stripe webhook. */
export async function runLifecycle(sql: Sql, o: { now?: Date } = {}) {
  return withJobRun(sql, { job: "lifecycle" }, async (ctx) => {
    // Time-based billing moves first (trial end, grace end, period end), then monthly credits.
    const moved = await refreshBillingStates(sql, undefined, o.now ?? new Date());
    ctx.meta.billing_changes = moved.length;
    ctx.meta.credit_grants = await grantMonthlyCredits(sql);
    const day3 = await sendDay3(sql, o.now ?? new Date());
    ctx.meta.trial_day3 = day3.sent;
    if (day3.noHomes.length) ctx.meta.day3_no_homes = day3.noHomes;
    const ending = await sql<{ id: string; name: string; days: number }[]>`
      select id, name, ceil(extract(epoch from trial_ends_at - now()) / 86400)::int as days from org
      where billing_state = 'trialing' and trial_ends_at > now() and trial_ends_at <= now() + interval '3 days'`;
    let sent = 0;
    for (const org of ending) {
      const res = await sendEmail(sql, {
        orgId: org.id, kind: "trial_ending", dedupeKey: `trial_ending:${org.id}`, to: await recipients(sql, org.id, []),
        subject: `Your 216 Leads trial ends in ${org.days} day${org.days === 1 ? "" : "s"}`,
        element: createElement(TrialEnding, { orgName: org.name, daysLeft: org.days, billingUrl: appUrl("/settings/billing") }),
      });
      if (res) sent++;
    }
    ctx.rowsUpserted = sent + day3.sent;
    ctx.meta.trial_ending = sent;
  });
}
