// ROI dashboard data (spec 9.6): metrics for a date range, the "proof from public records" rows
// and a monthly mailed-vs-won series. Dates are ET calendar dates, `to` inclusive.
import type { Sql } from "@216leads/db";
import { PLANS, type PlanKey } from "@216leads/shared";

export interface RoiMetrics {
  from: string;
  to: string;
  surfaced: number;
  contacted: number;
  mailed: number;
  quotes: number;
  won: number;
  revenue: number;
  costSubscription: number;
  costPostcards: number;
  /** Revenue won / cost, or null with no cost yet (trial). */
  roi: number | null;
}

export interface ProofRow {
  lead_id: string;
  addr_line: string;
  city: string;
  outcome: string;
  competitor: string | null;
  event_date: string;
  touched_at: string;
  days_to_event: number;
  description: string | null;
  source_url: string | null;
  mailed: boolean;
}

export interface MonthPoint {
  month: string;
  mailed: number;
  won: number;
}

const ET = "America/New_York";

/** Months of subscription inside [from, to] at the plan's monthly (or annual / 12) price. */
export function subscriptionCost(plan: string, interval: string | null, from: string, to: string): number {
  const p = PLANS[plan as Exclude<PlanKey, "trial" | "canceled">];
  if (!p) return 0;
  const days = (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000 + 1;
  const monthly = interval === "year" ? p.annual / 12 : p.monthly;
  return Math.round(monthly * (days / (365 / 12)));
}

export async function roiMetrics(sql: Sql, orgId: string, from: string, to: string): Promise<RoiMetrics> {
  const [m] = await sql<{ surfaced: number; contacted: number; quotes: number; won: number; revenue: number; mailed: number; postcard_cents: number }[]>`
    with r as (select ${from}::date as f, ${to}::date as t),
    moves as (
      select a.lead_id, a.data->>'to' as to_status from lead_activity a, r
      where a.org_id = ${orgId} and a.kind = 'status_change' and (a.created_at at time zone ${ET})::date between r.f and r.t
    )
    select
      (select count(*) from lead l, r where l.org_id = ${orgId} and (l.first_surfaced_at at time zone ${ET})::date between r.f and r.t)::int as surfaced,
      (select count(*) from lead l, r where l.org_id = ${orgId} and (l.first_touch_at at time zone ${ET})::date between r.f and r.t)::int as contacted,
      (select count(distinct lead_id) from moves where to_status = 'quoted')::int as quotes,
      (select count(distinct lead_id) from moves where to_status = 'won')::int as won,
      (select coalesce(sum(l.won_amount), 0) from lead l where l.org_id = ${orgId} and l.id in (select lead_id from moves where to_status = 'won'))::int as revenue,
      (select count(*) from mail_piece p, r where p.org_id = ${orgId} and p.status <> 'canceled' and (p.created_at at time zone ${ET})::date between r.f and r.t)::int as mailed,
      (select coalesce(sum(p.price_cents), 0) from mail_piece p, r where p.org_id = ${orgId} and p.status <> 'canceled' and (p.created_at at time zone ${ET})::date between r.f and r.t)::int as postcard_cents`;
  const [o] = await sql<{ plan: string; plan_interval: string | null }[]>`select plan, plan_interval from org where id = ${orgId}`;
  const costSubscription = subscriptionCost(o?.plan ?? "trial", o?.plan_interval ?? null, from, to);
  const costPostcards = Math.round(m!.postcard_cents / 100);
  const cost = costSubscription + costPostcards;
  return {
    from, to, surfaced: m!.surfaced, contacted: m!.contacted, mailed: m!.mailed, quotes: m!.quotes, won: m!.won, revenue: m!.revenue,
    costSubscription, costPostcards, roi: cost > 0 ? Math.round((m!.revenue / cost) * 10) / 10 : null,
  };
}

/** Homes the org touched that later pulled a permit in its trade (or sold), newest first. */
export async function proofRows(sql: Sql, orgId: string, from: string, to: string, limit = 200): Promise<ProofRow[]> {
  return sql<ProofRow[]>`
    select a.lead_id, p.addr_line, p.city, a.outcome,
      case when a.outcome = 'lost_competitor' then c.display_name end as competitor,
      a.event_date::text, a.touched_at::text, a.days_to_event, e.description, e.source_url,
      exists (select 1 from mail_piece m where m.lead_id = a.lead_id and m.status <> 'canceled') as mailed
    from attribution a
    join lead l on l.id = a.lead_id
    join parcel p on p.parcel_key = l.parcel_key
    join parcel_event e on e.id = a.parcel_event_id
    left join contractor c on c.id = a.competitor_id
    where a.org_id = ${orgId} and a.event_date between ${from}::date and ${to}::date
    order by a.event_date desc, a.id limit ${limit}`;
}

/** Last `months` calendar months (ET) of pieces mailed and leads won. */
export async function monthlySeries(sql: Sql, orgId: string, months = 12): Promise<MonthPoint[]> {
  return sql<MonthPoint[]>`
    with m as (
      select to_char(d, 'YYYY-MM') as month from generate_series(
        date_trunc('month', (now() at time zone ${ET})) - make_interval(months => ${months - 1}::int),
        date_trunc('month', (now() at time zone ${ET})), interval '1 month') d
    )
    select m.month,
      (select count(*) from mail_piece p where p.org_id = ${orgId} and p.status <> 'canceled'
        and to_char(p.created_at at time zone ${ET}, 'YYYY-MM') = m.month)::int as mailed,
      (select count(distinct a.lead_id) from lead_activity a where a.org_id = ${orgId} and a.kind = 'status_change'
        and a.data->>'to' = 'won' and to_char(a.created_at at time zone ${ET}, 'YYYY-MM') = m.month)::int as won
    from m order by m.month`;
}
