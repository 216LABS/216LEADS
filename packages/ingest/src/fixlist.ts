// Violations fix list (216_LEADS_PLAN "Violations fix list"): open code citations in the org's
// area whose category is the org's trade. Homes opted out of mail are left off.
import type { Sql } from "@216leads/db";
import { attributionCategory } from "./attribution";

export interface FixRow {
  event_id: number;
  parcel_key: string;
  addr_line: string;
  city: string;
  zip: string;
  event_date: string;
  raw_type: string | null;
  description: string | null;
  source_url: string | null;
  lead_id: string | null;
}

export async function fixList(sql: Sql, orgId: string, trade: string, limit = 500): Promise<{ category: string | null; rows: FixRow[] }> {
  const category = attributionCategory(trade);
  if (!category) return { category, rows: [] };
  const rows = await sql<FixRow[]>`
    select e.id as event_id, p.parcel_key, p.addr_line, p.city, p.zip, e.event_date::text, e.raw_type, e.description, e.source_url, l.id as lead_id
    from parcel_event e
    join parcel p on p.parcel_key = e.parcel_key
    left join lead l on l.org_id = ${orgId} and l.parcel_key = p.parcel_key
    where e.kind = 'violation' and e.is_active and e.category = ${category}
      and is_residential(p.land_use_code, p.data_limited)
      and p.parcel_key in (select org_territory_parcels(${orgId}))
      and not exists (select 1 from suppression s where s.addr_norm = p.addr_norm)
    order by e.event_date desc, e.id desc limit ${limit}`;
  return { category, rows };
}
