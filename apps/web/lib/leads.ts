import "server-only";
import { getSql } from "@216leads/db";
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
  const [r] = await sql<{ active: number; new_week: number; sold: number; won: number }[]>`
    select
      count(*) filter (where status in ('new','contacted','quoted'))::int as active,
      count(*) filter (where status in ('new','contacted','quoted') and (first_surfaced_at >= now() - interval '7 days' or trigger_date >= current_date - 7))::int as new_week,
      count(*) filter (where trigger_label ilike '%sold%' and status in ('new','contacted','quoted'))::int as sold,
      count(*) filter (where status = 'won')::int as won
    from lead where org_id = ${orgId} and not hidden and visible_from <= now()`;
  return r ?? { active: 0, new_week: 0, sold: 0, won: 0 };
}
