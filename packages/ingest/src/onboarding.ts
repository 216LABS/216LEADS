// Onboarding helpers (spec 9.1): area search with live counts, and the "upload my current
// customers" CSV that becomes org suppression. Only addresses are read from the CSV; names
// and any other columns are dropped in the browser before upload.
import type { Sql } from "@216leads/db";
import { normalizeAddress, titleCase, zip5 } from "@216leads/shared";
import { loadOrgProfile, previewTerritory } from "./score";

export const CUSTOMER_LINES_MAX = 5000;

/**
 * Hide an org's current customers (spec 9.1 step 3). Each line is "street address, zip" or
 * "street address, city, OH zip". Lines matching a known home also store its parcel key.
 */
export async function importCustomers(sql: Sql, orgId: string, lines: string[]) {
  const norms = new Map<string, string>();
  for (const raw of lines.slice(0, CUSTOMER_LINES_MAX)) {
    const line = raw.replace(/\s+/g, " ").trim();
    const zip = zip5(line.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1]);
    const street = line.split(",")[0]!.trim();
    if (!zip || !/^\d/.test(street)) continue;
    const n = normalizeAddress(street, zip);
    if (n.houseNo && n.street) norms.set(n.addrNorm, n.addrNorm);
  }
  const keys = [...norms.keys()];
  if (!keys.length) return { read: lines.length, saved: 0, matched: 0 };
  const res = await sql<{ matched: boolean }[]>`
    insert into org_suppression (org_id, addr_norm, parcel_key, reason)
    select ${orgId}, n, (select p.parcel_key from parcel p where p.addr_norm = n order by p.parcel_key limit 1), 'existing_customer'
    from unnest(${keys}::text[]) as n
    on conflict (org_id, addr_norm) do update set parcel_key = coalesce(excluded.parcel_key, org_suppression.parcel_key)
    returning parcel_key is not null as matched`;
  return { read: lines.length, saved: res.length, matched: res.filter((r) => r.matched).length };
}

export interface AreaMatch {
  kind: "zip" | "town";
  label: string;
  zips: string[];
  homes: number;
}

/** Type-ahead for the area step: ZIP prefixes and town names, from the homes we hold. */
export async function searchAreas(sql: Sql, q: string): Promise<AreaMatch[]> {
  const term = q.trim();
  if (/^\d{1,5}$/.test(term)) {
    const rows = await sql<{ zip: string; town: string; homes: number }[]>`
      select zip, mode() within group (order by city) as town, count(*)::int as homes
      from parcel where zip like ${`${term}%`} and is_residential(land_use_code, data_limited)
      group by zip having count(*) >= 50 order by zip limit 8`;
    return rows.map((r) => ({ kind: "zip", label: `${r.zip} ${titleCase(r.town)}`, zips: [r.zip], homes: r.homes }));
  }
  if (term.length < 2) return [];
  // A town is added as the ZIP codes where it has homes (decision 44).
  const rows = await sql<{ name: string; zips: string[]; homes: number }[]>`
    select m.name, array_agg(z.zip order by z.n desc) as zips, sum(z.n)::int as homes
    from municipality m
    join lateral (
      select p.zip, count(*) as n from parcel p
      where p.municipality_id = m.id and is_residential(p.land_use_code, p.data_limited) and p.zip is not null
      group by p.zip having count(*) >= 50
    ) z on true
    where m.name ilike ${`${term.replace(/[%_]/g, "")}%`}
    group by m.name order by sum(z.n) desc limit 8`;
  return rows.map((r) => ({ kind: "town", label: titleCase(r.name), zips: r.zips, homes: r.homes }));
}

export interface AreaCount {
  zip: string;
  town: string;
  matching: number;
  /** Another org holds the exclusive lock for this trade here (spec 13). */
  taken: boolean;
}

/** Live chip counts for the area step: "44107 Lakewood: 214 homes match". Same scoring as the leads list. */
export async function areaCounts(sql: Sql, trade: string, zips: string[], orgId: string | null): Promise<AreaCount[]> {
  // Issue #72: count with the org's own recipe and "Homes you want" settings once it has them, so the
  // chips agree with the leads list. The trade preset is only for a trade the org isn't on (sign-up).
  const own = orgId ? await loadOrgProfile(sql, orgId).catch(() => null) : null;
  const p = own && own.trade === trade
    ? await previewTerritory(sql, { template: own.template, profile: own.profile, zips, orgId })
    : await previewTerritory(sql, { trade, zips, orgId });
  const locks = await sql<{ zip: string }[]>`
    select zip from exclusivity_lock where trade = ${trade} and zip = any(${zips}) and org_id is distinct from ${orgId}`;
  const taken = new Set(locks.map((l) => l.zip));
  return p.zips.map((z) => ({ zip: z.zip, town: titleCase(z.town), matching: z.matching, taken: taken.has(z.zip) }));
}
