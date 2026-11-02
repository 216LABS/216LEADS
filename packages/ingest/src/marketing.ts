// Public marketing-site data (spec 9.8): the live counter, coverage per county, and the sample page
// per trade + ZIP. House numbers are masked here, on the server, so a full address never leaves.
import type { Sql } from "@216leads/db";
import { maskAddress, titleCase } from "@216leads/shared";
import { previewTerritory } from "./score";

/** Single-family arms-length sales in Cuyahoga over the last 30 days (the hero counter). */
export async function liveCounter(sql: Sql): Promise<{ sales: number }> {
  const [r] = await sql<{ n: number }[]>`
    select count(*)::int as n from parcel_event e join parcel p on p.parcel_key = e.parcel_key
    where e.kind = 'sale' and e.arms_length and p.county_code = 'cuyahoga' and p.land_use_code = '5100'
      and e.event_date >= (now() at time zone 'America/New_York')::date - 30`;
  return { sales: r?.n ?? 0 };
}

export interface CountyCoverage {
  county: string;
  homes: number;
  towns: number;
  permitTowns: string[];
  sources: { name: string; last_success_at: string | null; schedule: string }[];
}

const SOURCE_COUNTY: [RegExp, string][] = [[/^(cuy_|cle_)/, "cuyahoga"], [/^lake_/, "lake"], [/^stark_/, "stark"], [/^medina_/, "medina"], [/^summit_/, "summit"]];

export async function publicCoverage(sql: Sql): Promise<CountyCoverage[]> {
  const counties = await sql<{ code: string; name: string; homes: number; towns: number }[]>`
    select c.code, c.name,
      (select count(*) from parcel p where p.county_code = c.code and is_residential(p.land_use_code, p.data_limited))::int as homes,
      (select count(*) from municipality m where m.county_code = c.code)::int as towns
    from county c order by c.code = 'cuyahoga' desc, c.name`;
  const towns = await sql<{ county_code: string; name: string }[]>`
    select county_code, name from municipality where permits_source is not null order by name`;
  const sources = await sql<{ code: string; name: string; last_success_at: string | null; schedule_cron: string }[]>`
    select code, name, last_success_at::text, schedule_cron from source where code not like 'rr_%' order by name`;
  return counties.filter((c) => c.homes > 0).map((c) => ({
    county: c.name,
    homes: c.homes,
    towns: c.towns,
    permitTowns: towns.filter((t) => t.county_code === c.code).map((t) => titleCase(t.name)),
    sources: sources.filter((s) => SOURCE_COUNTY.find(([re]) => re.test(s.code))?.[1] === c.code)
      .map((s) => ({ name: s.name, last_success_at: s.last_success_at, schedule: s.schedule_cron })),
  }));
}

export interface PublicSample {
  zip: string;
  town: string;
  homes: number;
  matching: number;
  newThisWeek: number;
  examples: { addr: string; city: string; score: number; reasons: string[]; trigger: string | null }[];
}

export async function publicSample(sql: Sql, trade: string, zip: string): Promise<PublicSample | null> {
  const p = await previewTerritory(sql, { trade, zips: [zip], orgId: null });
  const z = p.zips[0];
  if (!z || !z.homes) return null;
  return {
    zip, town: titleCase(z.town), homes: z.homes, matching: z.matching, newThisWeek: z.new_this_week,
    examples: p.sample.map((h) => ({ addr: maskAddress(h.addr_line), city: titleCase(h.city), score: h.score, reasons: h.reasons.map((r) => r.label), trigger: h.trigger?.label ?? null })),
  };
}

/** Marketing sample request (spec 8 POST /api/public/sample). */
export async function saveProspect(sql: Sql, r: { email: string; business?: string | null; trade?: string | null; zips?: string[] }) {
  await sql`insert into prospect_request (email, business, trade, zips) values (${r.email}, ${r.business ?? null}, ${r.trade ?? null}, ${r.zips ?? []})`;
}
