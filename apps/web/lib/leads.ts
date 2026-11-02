import "server-only";
import { z } from "zod";
import { getSql } from "@216leads/db";
import { csvCell } from "@216leads/shared";
import type { ReasonView } from "@/components/lead-bits";

export type LeadView = "active" | "won" | "lost" | "skipped" | "all";
export type LeadChip = "score70" | "sold" | "neighbors" | "citation" | "new_week";
export type LeadSort = "score" | "newest" | "value";

export interface LeadQuery {
  view?: LeadView;
  chips?: LeadChip[];
  zip?: string;
  q?: string;
  sort?: LeadSort;
  page?: number;
  min_score?: number;
  status?: string;
}

export interface LeadRow {
  id: string;
  parcel_key: string;
  score: number;
  reasons: ReasonView[];
  pitch: string | null;
  trigger_label: string | null;
  trigger_date: string | null;
  status: string;
  first_surfaced_at: string;
  addr_line: string;
  city: string;
  zip: string;
  year_built: number | null;
  market_value: number | null;
}

export const PAGE_SIZE = 50;

const VIEWS: LeadView[] = ["active", "won", "lost", "skipped", "all"];
const CHIPS: LeadChip[] = ["score70", "sold", "neighbors", "citation", "new_week"];
const SORTS: LeadSort[] = ["score", "newest", "value"];

/** The list query from URL params, shared by the page, GET /api/leads and the CSV export. */
export function leadQueryFromParams(sp: URLSearchParams): LeadQuery {
  const pick = <T extends string>(v: string | null, allowed: T[], d: T) => (allowed.includes(v as T) ? (v as T) : d);
  const status = sp.get("status");
  return {
    view: pick(sp.get("view"), VIEWS, "active"),
    chips: (sp.get("chips") ?? "").split(",").filter((c): c is LeadChip => CHIPS.includes(c as LeadChip)),
    q: sp.get("q")?.slice(0, 80) || undefined,
    zip: /^\d{5}$/.test(sp.get("zip") ?? "") ? sp.get("zip")! : undefined,
    sort: pick(sp.get("sort"), SORTS, "score"),
    page: Math.min(1000, Math.max(1, Number(sp.get("page")) || 1)),
    min_score: Math.min(100, Math.max(0, Number(sp.get("min_score")) || 0)),
    status: status && ["new", "contacted", "quoted", "won", "lost", "skipped"].includes(status) ? status : undefined,
  };
}

export async function listLeads(orgId: string, q: LeadQuery): Promise<{ rows: LeadRow[]; total: number; page: number }> {
  const sql = getSql();
  const view = q.view ?? "active";
  const chips = new Set(q.chips ?? []);
  const page = Math.max(1, q.page ?? 1);
  const statuses =
    q.status ? [q.status]
    : view === "active" ? ["new", "contacted", "quoted"]
    : view === "all" ? ["new", "contacted", "quoted", "won", "lost", "skipped"]
    : [view];
  const minScore = Math.max(q.min_score ?? 0, chips.has("score70") ? 70 : 0);
  const trig = chips.has("sold") ? "%sold%" : chips.has("neighbors") ? "%neighbor%" : chips.has("citation") ? "%citation%" : null;
  const search = q.q?.trim() ? `%${q.q.trim().toUpperCase().replace(/[%_]/g, "")}%` : null;
  const order =
    q.sort === "newest" ? sql`l.trigger_date desc nulls last, l.first_surfaced_at desc, l.score desc`
    : q.sort === "value" ? sql`p.market_value desc nulls last, l.score desc`
    : sql`l.score desc, l.trigger_date desc nulls last, p.addr_line`;

  const where = sql`
    l.org_id = ${orgId} and not l.hidden and l.visible_from <= now()
    and l.status::text = any(${statuses})
    and l.score >= ${minScore}
    and (${trig}::text is null or l.trigger_label ilike ${trig})
    and (${chips.has("new_week")} = false or l.first_surfaced_at >= now() - interval '7 days' or l.trigger_date >= current_date - 7)
    and (${q.zip ?? null}::text is null or p.zip = ${q.zip ?? null})
    and (${search}::text is null or p.addr_line like ${search} or upper(p.city) like ${search})`;

  const rows = await sql<LeadRow[]>`
    select l.id, l.parcel_key, l.score, l.reasons, l.pitch, l.trigger_label, l.trigger_date, l.status::text as status,
      l.first_surfaced_at, p.addr_line, p.city, p.zip, p.year_built, p.market_value
    from lead l join parcel p on p.parcel_key = l.parcel_key
    where ${where}
    order by ${order}
    limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`;
  const [c] = await sql<{ n: number }[]>`
    select count(*)::int as n from lead l join parcel p on p.parcel_key = l.parcel_key where ${where}`;
  return { rows, total: c?.n ?? 0, page };
}

export async function leadCounts(orgId: string) {
  const sql = getSql();
  const [r] = await sql<{ active: number; new_week: number; sold: number; won: number; lost: number; skipped: number }[]>`
    select
      count(*) filter (where status in ('new','contacted','quoted'))::int as active,
      count(*) filter (where status in ('new','contacted','quoted') and (first_surfaced_at >= now() - interval '7 days' or trigger_date >= current_date - 7))::int as new_week,
      count(*) filter (where trigger_label ilike '%sold%' and status in ('new','contacted','quoted'))::int as sold,
      count(*) filter (where status = 'won')::int as won,
      count(*) filter (where status = 'lost')::int as lost,
      count(*) filter (where status = 'skipped')::int as skipped
    from lead where org_id = ${orgId} and not hidden and visible_from <= now()`;
  return r ?? { active: 0, new_week: 0, sold: 0, won: 0, lost: 0, skipped: 0 };
}

export interface LeadFacts {
  year_built: number | null; living_sqft: number | null; style: string | null; lot_acres: number | null; market_value: number | null;
  last_sale_date: string | null; last_sale_price: number | null; gas_service: boolean | null; water_source: string | null;
  sewer_type: string | null; canopy_pct: number | null; flood_zone: string | null; in_sfha: boolean | null; garage_type: string | null;
}

export interface LeadDetail extends LeadRow {
  won_amount: number | null;
  lost_reason: string | null;
  hidden: boolean;
  facts: LeadFacts;
  timeline: TimelineItem[];
}

export interface TimelineItem {
  at: string;
  kind: "permit" | "sale" | "violation" | "public" | "note" | "mail" | "status";
  title: string;
  detail?: string | null;
  url?: string | null;
}

const EVENT_TITLE: Record<string, string> = {
  permit: "Permit", sale: "Sold", violation: "City violation", condemnation: "Condemnation", demolition: "Demolition",
  boardup: "Board-up", rental_reg: "Rental registration", coo: "Certificate of occupancy", lead_safe: "Lead-safe certificate",
  disclosure: "Rental disclosure",
};

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/** Spec 9.4 / GET /api/leads/:id. Null when the lead is not this org's (the caller answers 404). */
export async function getLead(orgId: string, id: string): Promise<LeadDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sql = getSql();
  const [l] = await sql<(LeadRow & { won_amount: number | null; lost_reason: string | null; hidden: boolean } & LeadFacts)[]>`
    select l.id, l.parcel_key, l.score, l.reasons, l.pitch, l.trigger_label, l.trigger_date, l.status::text as status,
      l.first_surfaced_at, l.won_amount, l.lost_reason, l.hidden, p.addr_line, p.city, p.zip, p.year_built, p.market_value,
      p.living_sqft, p.style, p.lot_acres, p.last_sale_date::text as last_sale_date, p.last_sale_price, p.gas_service,
      p.water_source, p.sewer_type, p.canopy_pct, p.flood_zone, p.in_sfha, p.garage_type
    from lead l join parcel p on p.parcel_key = l.parcel_key
    where l.org_id = ${orgId} and l.id = ${id} and l.visible_from <= now()`;
  if (!l) return null;
  const events = await sql<{ kind: string; event_date: string; raw_type: string | null; description: string | null;
    amount: number | null; source_url: string | null; contractor: string | null }[]>`
    select e.kind::text as kind, e.event_date::text as event_date, e.raw_type, e.description, e.amount, e.source_url,
      case when c.is_individual then 'Independent contractor' else c.display_name end as contractor
    from parcel_event e left join contractor c on c.id = e.contractor_id
    where e.parcel_key = ${l.parcel_key}
    order by e.event_date desc, e.id desc limit 100`;
  const notes = await sql<{ created_at: string; body: string }[]>`
    select created_at::text, body from lead_note where org_id = ${orgId} and lead_id = ${id} order by created_at desc limit 100`;
  const mail = await sql<{ created_at: string; status: string }[]>`
    select created_at::text, status from mail_piece where org_id = ${orgId} and lead_id = ${id} order by created_at desc limit 50`;
  const moves = await sql<{ created_at: string; data: { from?: string; to?: string } }[]>`
    select created_at::text, data from lead_activity where org_id = ${orgId} and lead_id = ${id} and kind = 'status_change'
    order by created_at desc limit 50`;
  const timeline: TimelineItem[] = [
    ...events.map((e): TimelineItem => ({
      at: e.event_date,
      kind: e.kind === "permit" || e.kind === "sale" || e.kind === "violation" ? e.kind : "public",
      title: e.kind === "sale" ? `Sold${e.amount ? ` for ${money(e.amount)}` : ""}` : `${EVENT_TITLE[e.kind] ?? e.kind}${e.raw_type ? `: ${e.raw_type}` : ""}`,
      detail: [e.description?.slice(0, 240), e.contractor].filter(Boolean).join(" · ") || null,
      url: e.source_url,
    })),
    ...notes.map((n): TimelineItem => ({ at: n.created_at, kind: "note", title: "Note", detail: n.body })),
    ...mail.map((m): TimelineItem => ({ at: m.created_at, kind: "mail", title: `Postcard ${m.status}` })),
    ...moves.map((s): TimelineItem => ({ at: s.created_at, kind: "status", title: `Marked ${s.data.to ?? ""}`.trim() })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return {
    id: l.id, parcel_key: l.parcel_key, score: l.score, reasons: l.reasons, pitch: l.pitch, trigger_label: l.trigger_label,
    trigger_date: l.trigger_date, status: l.status, first_surfaced_at: l.first_surfaced_at, addr_line: l.addr_line, city: l.city,
    zip: l.zip, year_built: l.year_built, market_value: l.market_value, won_amount: l.won_amount, lost_reason: l.lost_reason, hidden: l.hidden,
    facts: {
      year_built: l.year_built, living_sqft: l.living_sqft, style: l.style, lot_acres: l.lot_acres === null ? null : Number(l.lot_acres),
      market_value: l.market_value, last_sale_date: l.last_sale_date, last_sale_price: l.last_sale_price, gas_service: l.gas_service,
      water_source: l.water_source, sewer_type: l.sewer_type, canopy_pct: l.canopy_pct === null ? null : Number(l.canopy_pct),
      flood_zone: l.flood_zone, in_sfha: l.in_sfha, garage_type: l.garage_type,
    },
    timeline,
  };
}

export const LOST_REASONS = ["price", "timing", "competitor", "no_response", "other"] as const;
export const STATUSES = ["new", "contacted", "quoted", "won", "lost", "skipped"] as const;

export const LeadPatchSchema = z.object({
  status: z.enum(STATUSES).optional(),
  won_amount: z.number().int().min(0).max(10_000_000).nullable().optional(),
  lost_reason: z.enum(LOST_REASONS).nullable().optional(),
  hidden: z.boolean().optional(),
}).strict();
export type LeadPatch = z.infer<typeof LeadPatchSchema>;

/** PATCH /api/leads/:id core (also bulk). Records a status_change activity per moved lead. */
export async function updateLeads(orgId: string, ids: string[], patch: LeadPatch): Promise<{ found: number; moved: { id: string; from: string; to: string }[] }> {
  const sql = getSql();
  return sql.begin(async (tx) => {
    const before = await tx<{ id: string; status: string }[]>`
      select id, status::text as status from lead where org_id = ${orgId} and id = any(${ids}::uuid[]) for update`;
    if (!before.length) return { found: 0, moved: [] };
    const has = (k: keyof LeadPatch) => Object.prototype.hasOwnProperty.call(patch, k);
    const status = patch.status ?? null;
    await tx`
      update lead set
        status_changed_at = case when ${status}::lead_status is not null and ${status}::lead_status <> status then now() else status_changed_at end,
        first_touch_at = case when first_touch_at is null and coalesce(${status}::lead_status, status) <> 'new' then now() else first_touch_at end,
        status = coalesce(${status}::lead_status, status),
        won_amount = case when ${has("won_amount")} then ${patch.won_amount ?? null}::int else won_amount end,
        lost_reason = case when ${has("lost_reason")} then ${patch.lost_reason ?? null}::text else lost_reason end,
        hidden = coalesce(${patch.hidden ?? null}::boolean, hidden)
      where org_id = ${orgId} and id = any(${before.map((b) => b.id)}::uuid[])`;
    const moved = status ? before.filter((b) => b.status !== status).map((b) => ({ id: b.id, from: b.status, to: status })) : [];
    for (const m of moved) {
      await tx`insert into lead_activity (org_id, lead_id, kind, data) values (${orgId}, ${m.id}, 'status_change', ${tx.json({ from: m.from, to: m.to })})`;
    }
    return { found: before.length, moved };
  });
}

export async function addNote(orgId: string, leadId: string, authorId: string, body: string): Promise<boolean> {
  const sql = getSql();
  const [l] = await sql`select 1 from lead where org_id = ${orgId} and id = ${leadId}`;
  if (!l) return false;
  await sql`insert into lead_note (org_id, lead_id, author_id, body) values (${orgId}, ${leadId}, ${authorId}, ${body})`;
  await sql`update lead set first_touch_at = coalesce(first_touch_at, now()) where id = ${leadId} and org_id = ${orgId}`;
  return true;
}

/** Rows this org may still export today (spec 13: 2,000 rows/day, counted in ET days). */
export async function exportAllowance(orgId: string, cap: number): Promise<number> {
  const [r] = await getSql()<{ n: number }[]>`
    select coalesce(sum((data->>'rows')::int), 0)::int as n from lead_activity
    where org_id = ${orgId} and kind = 'export'
      and created_at >= (date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York')`;
  return Math.max(0, cap - (r?.n ?? 0));
}

/** GET /api/leads/export.csv: address, city, zip, score, trigger, reasons, status. Never names (spec 14). */
export async function exportLeadsCsv(orgId: string, q: LeadQuery & { ids?: string[] }, limit: number, disclaimer: string) {
  const sql = getSql();
  let rows: Pick<LeadRow, "addr_line" | "city" | "zip" | "score" | "trigger_label" | "reasons" | "status">[] = [];
  if (limit > 0 && q.ids?.length) {
    rows = await sql<LeadRow[]>`
      select l.score, l.reasons, l.status::text as status, l.trigger_label, p.addr_line, p.city, p.zip
      from lead l join parcel p on p.parcel_key = l.parcel_key
      where l.org_id = ${orgId} and l.id = any(${q.ids}::uuid[]) and l.visible_from <= now()
      order by l.score desc limit ${limit}`;
  } else if (limit > 0) {
    for (let page = 1; rows.length < limit; page++) {
      const r = await listLeads(orgId, { ...q, page });
      rows.push(...r.rows);
      if (r.rows.length < PAGE_SIZE) break;
    }
    rows = rows.slice(0, limit);
  }
  const lines = [
    ["address", "city", "zip", "score", "trigger", "reasons", "status"].join(","),
    ...rows.map((r) => [r.addr_line, r.city, r.zip, r.score, r.trigger_label ?? "", r.reasons.map((x) => x.label).join("; "), r.status].map(csvCell).join(",")),
    "",
    csvCell(disclaimer),
  ];
  if (rows.length) await sql`insert into lead_activity (org_id, kind, data) values (${orgId}, 'export', ${sql.json({ rows: rows.length })})`;
  return { csv: `${lines.join("\n")}\n`, rows: rows.length };
}
