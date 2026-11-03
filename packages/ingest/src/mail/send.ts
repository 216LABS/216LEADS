// Postcard sends (spec 9.5, 10.3, 10.4): pre-send checks in spec order with a count per removal,
// cost preview (credits first, then $0.99 metered), commit with a 15-minute undo, cancel.
import type { Sql } from "@216leads/db";
import { appUrl } from "@216leads/email";
import { MAIL_UNDO_MINUTES, NO_REPEAT_DAYS, POSTCARD_PRICE_CENTS, titleCase, TRADES } from "@216leads/shared";
import { linkSecretSign } from "./sign";
import { DESIGNS, defaultHeadline, designLabel, personalize, renderPostcard, tradeInText, type Design, type TemplateMerge } from "./templates";
import type { Address, MailProvider } from "./provider";

export const REMOVAL_KEYS = ["territory", "suppression", "your_list", "mailed_recently", "no_funds", "bad_address"] as const;
export type Removal = (typeof REMOVAL_KEYS)[number];

export interface SendRequest {
  orgId: string;
  leadIds?: string[];
  parcelKeys?: string[];
  templateId: string;
  merge?: TemplateMerge;
  ruleId?: string | null;
  /** Monthly spend cap for auto-mail rules (cents of metered price). */
  capCents?: number | null;
  maxPieces?: number;
  /** An auto-mail follow-up: the 30-day rule is the point of the campaign, so it's skipped. */
  followup?: boolean;
}

export interface PlannedPiece { parcel_key: string; lead_id: string | null; to: Address; street: string | null; year_built: number | null; billed_via: "credit" | "metered" }

export interface SendPlan {
  requested: number;
  removed: Record<Removal, number>;
  pieces: PlannedPiece[];
  credits: number;
  metered: number;
  costCents: number;
  deliveryWindow: string;
}

/** Make sure the 3 system templates exist for every trade (idempotent). */
export async function ensureSystemTemplates(sql: Sql) {
  const trades = [...TRADES.map((t) => t.key as string), "fence", "new_movers"];
  for (const trade of trades) {
    for (const d of DESIGNS) {
      await sql`
        insert into postcard_template (org_id, trade, name, front_html, back_html, merge_defaults)
        values (null, ${trade}, ${designLabel(d)}, ${`design:${d}`}, ${`design:${d}`}, ${sql.json({ design: d, headline: defaultHeadline(d, trade) })})
        on conflict (trade, name) where org_id is null do nothing`;
    }
  }
}

export interface TemplateRow { id: string; org_id: string | null; trade: string | null; name: string; merge_defaults: TemplateMerge & { design?: Design } }

export async function templatesFor(sql: Sql, orgId: string, trade: string): Promise<TemplateRow[]> {
  await ensureSystemTemplates(sql);
  return sql<TemplateRow[]>`
    select id, org_id, trade, name, merge_defaults from postcard_template
    where (org_id is null and trade = ${trade}) or org_id = ${orgId}
    order by org_id nulls first, created_at`;
}

const addrComplete = (a: { addr_line: string | null; city: string | null; zip: string | null }) =>
  !!a.addr_line && /^\d+[A-Z]?\s+\S+/i.test(a.addr_line) && !!a.city && /^\d{5}$/.test(a.zip ?? "");

/** Spec 10.3 checks in order; each home is counted under the first check it fails. */
export async function planSend(sql: Sql, r: SendRequest): Promise<SendPlan> {
  const [org] = await sql<{ postcard_credits: number; billing_state: string; stripe_customer_id: string | null }[]>`
    select postcard_credits, billing_state, stripe_customer_id from org where id = ${r.orgId}`;
  if (!org) throw new Error("org not found");
  const fromLeads = r.leadIds?.length
    ? await sql<{ parcel_key: string; lead_id: string }[]>`
        select parcel_key, id as lead_id from lead where org_id = ${r.orgId} and id = any(${r.leadIds}::uuid[]) and visible_from <= now()`
    : [];
  const keys = [...new Set([...fromLeads.map((l) => l.parcel_key), ...(r.parcelKeys ?? [])])];
  const leadOf = new Map(fromLeads.map((l) => [l.parcel_key, l.lead_id]));
  const rows = await sql<{ parcel_key: string; addr_line: string | null; addr_norm: string; city: string | null; zip: string | null; year_built: number | null;
    in_territory: boolean; suppressed: boolean; own_list: boolean; recent: boolean }[]>`
    select p.parcel_key, p.addr_line, p.addr_norm, p.city, p.zip, p.year_built,
      p.parcel_key in (select org_territory_parcels(${r.orgId})) as in_territory,
      exists (select 1 from suppression s where s.addr_norm = p.addr_norm or s.parcel_key = p.parcel_key) as suppressed,
      exists (select 1 from org_suppression s where s.org_id = ${r.orgId} and (s.addr_norm = p.addr_norm or s.parcel_key = p.parcel_key))
        or exists (select 1 from lead l where l.org_id = ${r.orgId} and l.parcel_key = p.parcel_key and l.hidden) as own_list,
      exists (select 1 from mail_piece m where m.org_id = ${r.orgId} and m.parcel_key = p.parcel_key and m.status <> 'canceled'
        and m.created_at > now() - make_interval(days => ${NO_REPEAT_DAYS})) as recent
    from parcel p where p.parcel_key = any(${keys})
    order by p.parcel_key`;
  // Metered spend already used this month (auto-mail cap).
  const [spent] = r.capCents != null && r.ruleId
    ? await sql<{ c: number }[]>`select coalesce(sum(price_cents), 0)::int as c from mail_piece where rule_id = ${r.ruleId} and status <> 'canceled'
        and created_at >= date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York'`
    : [{ c: 0 }];
  const removed = Object.fromEntries(REMOVAL_KEYS.map((k) => [k, 0])) as Record<Removal, number>;
  removed.territory = keys.length - rows.length; // unknown homes
  const pieces: PlannedPiece[] = [];
  let credits = org.postcard_credits;
  let metered = 0;
  const canMeter = org.billing_state === "active" && !!org.stripe_customer_id;
  for (const p of rows) {
    if (r.maxPieces && pieces.length >= r.maxPieces) break;
    const fail: Removal | null = !p.in_territory ? "territory" : p.suppressed ? "suppression" : p.own_list ? "your_list" : p.recent && !r.followup ? "mailed_recently" : null;
    if (fail) {
      removed[fail]++;
      continue;
    }
    let billed: "credit" | "metered";
    if (credits > 0) billed = "credit";
    else if (canMeter && (r.capCents == null || spent!.c + (metered + 1) * POSTCARD_PRICE_CENTS <= r.capCents)) billed = "metered";
    else {
      removed.no_funds++;
      continue;
    }
    if (!addrComplete(p)) {
      removed.bad_address++;
      continue;
    }
    if (billed === "credit") credits--;
    else metered++;
    const street = p.addr_line!.replace(/^\d+[A-Z]?\s+/i, "");
    pieces.push({
      parcel_key: p.parcel_key, lead_id: leadOf.get(p.parcel_key) ?? null, street: titleCase(street), year_built: p.year_built, billed_via: billed,
      to: { name: "Current Resident", line1: titleCase(p.addr_line!), city: titleCase(p.city!), state: "OH", zip: p.zip! },
    });
  }
  return {
    requested: keys.length, removed, pieces, credits: org.postcard_credits - credits, metered,
    costCents: metered * POSTCARD_PRICE_CENTS, deliveryWindow: "about 4 to 8 days after mailing",
  };
}

export interface OrgSender { name: string; trade: string; phone: string | null; website: string | null; default_offer: string | null; return_address: Record<string, string> | null; has_logo: boolean }

export class SendBlockedError extends Error {}

/** Public, signed logo URL for print (the in-app one needs a session). */
export function printLogoUrl(orgId: string) {
  return appUrl(`/api/public/logo/${orgId}?s=${linkSecretSign(`logo:${orgId}`)}`);
}

/** Create the pieces and hand them to the provider with send_date = now + 15 min. */
export async function commitSend(sql: Sql, r: SendRequest, plan: SendPlan, provider: MailProvider): Promise<{ batchId: string; queued: number; failed: number; sendAfter: Date }> {
  const [org] = await sql<OrgSender[]>`
    select name, trade, phone, website, default_offer, return_address, logo_path is not null as has_logo from org where id = ${r.orgId}`;
  const ra = org!.return_address;
  if (!ra?.line1 || !ra.city || !ra.zip) throw new SendBlockedError("Add a return address in Settings → Digest and return address first.");
  const phone = r.merge?.phone ?? org!.phone;
  if (!phone) throw new SendBlockedError("Add your phone number in Settings → Brand first.");
  const [tpl] = await sql<TemplateRow[]>`select id, org_id, trade, name, merge_defaults from postcard_template where id = ${r.templateId} and (org_id is null or org_id = ${r.orgId})`;
  if (!tpl) throw new SendBlockedError("Template not found");
  const m = { ...tpl.merge_defaults, ...r.merge };
  const design: Design = m.design && DESIGNS.includes(m.design) ? m.design : "neighbors";
  const from: Address = { name: (ra.name || org!.name).slice(0, 40), line1: ra.line1, line2: ra.line2 || undefined, city: ra.city, state: ra.state || "OH", zip: ra.zip };
  const sendAfter = new Date(Date.now() + MAIL_UNDO_MINUTES * 60_000);
  const batchId = crypto.randomUUID();
  const headline = m.headline ?? defaultHeadline(design, org!.trade);
  const offer = m.offer ?? org!.default_offer ?? `Call for a free ${tradeInText(org!.trade)} estimate.`;
  let queued = 0;
  let failed = 0;
  for (const p of plan.pieces) {
    const merge = { design, headline: personalize(headline, p), offer, expiry: m.expiry ?? null, phone, website: m.website ?? org!.website };
    const [piece] = await sql<{ id: string }[]>`
      insert into mail_piece (org_id, lead_id, parcel_key, template_id, rule_id, provider, to_address, merge_variables, send_after, price_cents, billed_via, batch_id)
      values (${r.orgId}, ${p.lead_id}, ${p.parcel_key}, ${tpl.id}, ${r.ruleId ?? null}, ${provider.name}, ${sql.json(p.to as never)}, ${sql.json(merge)},
        ${sendAfter}, ${p.billed_via === "metered" ? POSTCARD_PRICE_CENTS : 0}, ${p.billed_via}, ${batchId})
      returning id`;
    // Spend the credit with the piece, so a failed provider call can give it back.
    if (p.billed_via === "credit") {
      await sql`update org set postcard_credits = postcard_credits - 1 where id = ${r.orgId}`;
      await sql`insert into usage_ledger (org_id, kind, qty, ref_id) values (${r.orgId}, 'credit_use', 1, ${piece!.id})`;
    }
    try {
      const html = await renderPostcard(design, {
        business: org!.name, headline: merge.headline, offer, expiry: merge.expiry, phone, website: merge.website,
        logoUrl: org!.has_logo ? printLogoUrl(r.orgId) : null, returnAddress: `${from.line1}, ${from.city}, ${from.state} ${from.zip}`,
      });
      const res = await provider.createPostcard({
        idempotencyKey: piece!.id, to: p.to, from, frontHtml: html.front, backHtml: html.back, size: "4x6", sendDate: sendAfter.toISOString(),
        description: `216 HomeSignal ${batchId.slice(0, 8)}`,
      });
      await sql`
        update mail_piece set provider_id = ${res.id}, status = 'submitted', expected_delivery = ${res.expectedDelivery ?? null}, cost_cents = ${res.costCents ?? null},
          events = events || ${sql.json([{ status: "submitted", at: new Date().toISOString() }])}
        where id = ${piece!.id}`;
      if (p.lead_id) await sql`update lead set first_touch_at = coalesce(first_touch_at, now()) where id = ${p.lead_id}`;
      queued++;
    } catch (e) {
      failed++;
      await sql`update mail_piece set status = 'failed', error = ${String(e instanceof Error ? e.message : e).slice(0, 500)} where id = ${piece!.id}`;
      if (p.billed_via === "credit") await refundCredit(sql, r.orgId, piece!.id);
    }
  }
  return { batchId, queued, failed, sendAfter };
}

async function refundCredit(sql: Sql, orgId: string, pieceId: string) {
  await sql`update org set postcard_credits = postcard_credits + 1 where id = ${orgId}`;
  await sql`insert into usage_ledger (org_id, kind, qty, ref_id) values (${orgId}, 'credit_refund', 1, ${pieceId})`;
}

/** Undo within the 15-minute window (spec 9.5). Returns how many pieces were canceled. */
export async function cancelPieces(sql: Sql, orgId: string, where: { pieceId?: string; batchId?: string }, provider: MailProvider): Promise<number> {
  const rows = await sql<{ id: string; provider_id: string | null; billed_via: string }[]>`
    select id, provider_id, billed_via from mail_piece
    where org_id = ${orgId} and status in ('queued', 'submitted') and send_after > now()
      and (${where.pieceId ?? null}::uuid is null or id = ${where.pieceId ?? null}::uuid)
      and (${where.batchId ?? null}::uuid is null or batch_id = ${where.batchId ?? null}::uuid)`;
  let n = 0;
  for (const p of rows) {
    if (p.provider_id) await provider.cancel(p.provider_id);
    await sql`update mail_piece set status = 'canceled', canceled_at = now(), events = events || ${sql.json([{ status: "canceled", at: new Date().toISOString() }])} where id = ${p.id}`;
    if (p.billed_via === "credit") await refundCredit(sql, orgId, p.id);
    n++;
  }
  return n;
}
