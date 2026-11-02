// Parcel upserts shared by every county adapter. Only changed rows are written and counted.
import type { Sql } from "@216leads/db";

export interface ParcelRow {
  parcel_key: string;
  county_code: string;
  parcel_id: string;
  municipality_id: number | null;
  addr_line: string;
  addr_unit: string | null;
  city: string;
  zip: string;
  addr_norm: string;
  land_use_code: string | null;
  land_use_desc: string | null;
  is_single_family: boolean | null;
  is_condo: boolean;
  year_built: number | null;
  living_sqft: number | null;
  rooms: number | null;
  style: string | null;
  lot_acres: number | null;
  lot_sqft: number | null;
  garage_type: string | null;
  gas_service: boolean | null;
  water_source: string | null;
  sewer_type: string | null;
  market_value: number | null;
  assessed_value: number | null;
  owner_occupied_guess: boolean | null;
  last_sale_date: string | null;
  last_sale_price: number | null;
  foreclosure_flag: boolean | null;
  tax_delinquent: boolean | null;
  data_limited: boolean;
  source_updated_at: string | null;
  lon?: number | null;
  lat?: number | null;
}

/** Columns this upsert owns. Columns set by other jobs (canopy, flood, survey, rental, geom) are left alone. */
const COLS: [keyof ParcelRow, string][] = [
  ["county_code", "text"], ["parcel_id", "text"], ["municipality_id", "int"], ["addr_line", "text"], ["addr_unit", "text"],
  ["city", "text"], ["zip", "text"], ["addr_norm", "text"], ["land_use_code", "text"], ["land_use_desc", "text"],
  ["is_single_family", "boolean"], ["is_condo", "boolean"], ["year_built", "int"], ["living_sqft", "int"], ["rooms", "int"],
  ["style", "text"], ["lot_acres", "numeric"], ["lot_sqft", "int"], ["garage_type", "text"], ["gas_service", "boolean"],
  ["water_source", "text"], ["sewer_type", "text"], ["market_value", "int"], ["assessed_value", "int"],
  ["owner_occupied_guess", "boolean"], ["last_sale_date", "date"], ["last_sale_price", "int"], ["foreclosure_flag", "boolean"],
  ["tax_delinquent", "boolean"], ["data_limited", "boolean"],
];

export async function upsertParcels(sql: Sql, rows: ParcelRow[], opts: { withGeom?: boolean } = {}): Promise<number> {
  if (!rows.length) return 0;
  const uniq = [...new Map(rows.map((r) => [r.parcel_key, r])).values()];
  const names = COLS.map(([c]) => c as string);
  const recType = ["parcel_key text", ...COLS.map(([c, t]) => `${c} ${t}`), "source_updated_at timestamptz", "lon float8", "lat float8"].join(", ");
  const geomInsert = opts.withGeom ? "case when lon is not null then st_setsrid(st_makepoint(lon, lat), 4326) end" : "null";
  const geomUpdate = opts.withGeom ? ", geom = coalesce(excluded.geom, parcel.geom)" : "";
  const query = `
    insert into parcel (parcel_key, ${names.join(", ")}, source_updated_at, geom)
    select parcel_key, ${names.join(", ")}, source_updated_at, ${geomInsert}
    from jsonb_to_recordset($1::text::jsonb) as x(${recType})
    on conflict (parcel_key) do update set
      ${names.map((c) => `${c} = excluded.${c}`).join(", ")},
      source_updated_at = excluded.source_updated_at, updated_at = now()${geomUpdate}
    where (${names.map((c) => `parcel.${c}`).join(", ")}) is distinct from (${names.map((c) => `excluded.${c}`).join(", ")})
    returning 1`;
  const res = await sql.unsafe(query, [JSON.stringify(uniq)] as never[]);
  return res.length;
}

const muniCache = new Map<string, number>();

/** Resolve (and create) municipality ids for names in a county. */
export async function municipalityIds(sql: Sql, county: string, names: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const missing: string[] = [];
  for (const n of new Set(names)) {
    const id = muniCache.get(`${county}|${n}`);
    if (id) out.set(n, id);
    else missing.push(n);
  }
  if (missing.length) {
    await sql`insert into municipality (county_code, name) select ${county}, unnest(${missing}::text[]) on conflict do nothing`;
    const rows = await sql<{ id: number; name: string }[]>`
      select id, name from municipality where county_code = ${county} and name = any(${missing})`;
    for (const r of rows) {
      muniCache.set(`${county}|${r.name}`, r.id);
      out.set(r.name, r.id);
    }
  }
  return out;
}
