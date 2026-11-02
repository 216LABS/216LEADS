// Attribution (spec step 5, job order 06:15): when a later public permit in the org's trade, or an
// arms-length sale, shows up at a home the org touched (contacted, mailed or marked), record it.
// Permit outcomes: won_self (the lead is marked won, or the permit names the org's own business),
// lost_competitor (a named business pulled it), unknown (no business named). Sales are `sold`.
import type { Sql } from "@216leads/db";
import { contractorNameNorm } from "@216leads/shared";
import { TRADE_CATEGORY } from "@216leads/scoring";
import { withJobRun } from "./runtime";

/** Permit category that counts as "the job" for a trade. */
export function attributionCategory(trade: string): string | null {
  return TRADE_CATEGORY[trade] ?? (trade === "fence" ? "fence_deck" : null);
}

/** How long after the first touch a permit or sale still counts. */
export const ATTRIBUTION_WINDOW_DAYS = 365;

export interface AttributionStats {
  inserted: number;
  updated: number;
}

export async function attributeOrg(sql: Sql, orgId: string): Promise<AttributionStats> {
  const [org] = await sql<{ name: string; trade: string }[]>`select name, trade from org where id = ${orgId}`;
  if (!org) return { inserted: 0, updated: 0 };
  const cat = attributionCategory(org.trade);
  const self = contractorNameNorm(org.name) || null;
  const rows = await sql<{ id: string; lead_id: string; outcome: string; parcel_event_id: number; inserted: boolean }[]>`
    with touched as (
      select l.id, l.org_id, l.parcel_key, l.status, l.first_touch_at,
        (l.first_touch_at at time zone 'America/New_York')::date as touch_date
      from lead l where l.org_id = ${orgId} and l.first_touch_at is not null
    ), found as (
      select t.org_id, t.id as lead_id, e.id as parcel_event_id, t.first_touch_at, e.event_date,
        (e.event_date - t.touch_date) as days,
        case
          when e.kind = 'sale' then 'sold'
          when t.status = 'won' or (c.name_norm is not null and c.name_norm = ${self}) then 'won_self'
          when c.id is not null and not c.is_individual then 'lost_competitor'
          else 'unknown'
        end as outcome,
        case when e.kind = 'permit' and t.status <> 'won' and c.id is not null and not c.is_individual
          and c.name_norm is distinct from ${self} then c.id end as competitor_id
      from touched t
      join parcel_event e on e.parcel_key = t.parcel_key
      left join contractor c on c.id = e.contractor_id
      where e.event_date > t.touch_date and e.event_date <= t.touch_date + ${ATTRIBUTION_WINDOW_DAYS}::int
        and ((e.kind = 'permit' and e.category = ${cat}) or (e.kind = 'sale' and e.arms_length))
    )
    insert into attribution (org_id, lead_id, parcel_event_id, outcome, competitor_id, touched_at, event_date, days_to_event)
    select org_id, lead_id, parcel_event_id, outcome, competitor_id, first_touch_at, event_date, days from found
    on conflict (org_id, lead_id, parcel_event_id) do update set outcome = excluded.outcome, competitor_id = excluded.competitor_id
      where not attribution.confirmed_by_user
        and (attribution.outcome, attribution.competitor_id) is distinct from (excluded.outcome, excluded.competitor_id)
    returning id, lead_id, outcome, parcel_event_id, (xmax = 0) as inserted`;
  const fresh = rows.filter((r) => r.inserted);
  if (fresh.length) {
    await sql`
      insert into lead_activity (org_id, lead_id, kind, data)
      select ${orgId}, x.lead_id, 'attribution', jsonb_build_object('outcome', x.outcome, 'event_id', x.parcel_event_id)
      from jsonb_to_recordset(${sql.json(fresh.map((r) => ({ lead_id: r.lead_id, outcome: r.outcome, parcel_event_id: r.parcel_event_id })) as never)})
        as x(lead_id uuid, outcome text, parcel_event_id bigint)`;
  }
  return { inserted: fresh.length, updated: rows.length - fresh.length };
}

export async function runAttribution(sql: Sql, onlyOrg?: string) {
  return withJobRun(sql, { job: "attribution" }, async (ctx) => {
    const orgs = onlyOrg ? [{ id: onlyOrg }] : await sql<{ id: string }[]>`select id from org where onboarded_at is not null`;
    for (const o of orgs) {
      const s = await attributeOrg(sql, o.id);
      ctx.rowsIn++;
      ctx.rowsUpserted += s.inserted + s.updated;
    }
  });
}
