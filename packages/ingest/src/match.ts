// Address and parcel matching (spec 6). Order: parcel id, exact address, fuzzy street, geo.
import type { Sql } from "@216leads/db";
import { normalizeAddress } from "@216leads/shared";

export interface MatchInput {
  county: string;
  parcelId?: string | null;
  addrLine?: string | null;
  zip?: string | number | null;
  lon?: number | null;
  lat?: number | null;
}

export type MatchMethod = "parcel_id" | "address_exact" | "address_fuzzy" | "geo";

export interface MatchResult {
  parcel_key: string;
  method: MatchMethod;
  confidence: number;
}

/** Normalize a county parcel id: strip non-alphanumerics, uppercase; Cuyahoga pads to 8 digits. */
export function normalizeParcelId(county: string, raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!s) return null;
  if (county === "cuyahoga" && /^\d+$/.test(s) && s.length <= 8) return s.padStart(8, "0");
  return s;
}

const ORDINAL = /(\d+)(ST|ND|RD|TH)\b/g;
const stripOrdinals = (s: string) => s.replace(ORDINAL, "$1");

export async function matchBatch(sql: Sql, inputs: MatchInput[]): Promise<(MatchResult | null)[]> {
  const out: (MatchResult | null)[] = inputs.map(() => null);

  // 1. Parcel id.
  const keyByIdx = new Map<number, string>();
  inputs.forEach((m, i) => {
    const id = normalizeParcelId(m.county, m.parcelId);
    if (id) keyByIdx.set(i, `${m.county}:${id}`);
  });
  if (keyByIdx.size) {
    const keys = [...new Set(keyByIdx.values())];
    const found = new Set(
      (await sql<{ parcel_key: string }[]>`select parcel_key from parcel where parcel_key = any(${keys})`).map((r) => r.parcel_key),
    );
    for (const [i, k] of keyByIdx) if (found.has(k)) out[i] = { parcel_key: k, method: "parcel_id", confidence: 1 };
  }

  // 2. Exact normalized address.
  const normByIdx = new Map<number, { county: string; norm: string; house: string; street: string; zip: string }>();
  inputs.forEach((m, i) => {
    if (out[i] || !m.addrLine) return;
    const a = normalizeAddress(m.addrLine, m.zip);
    if (!a.houseNo || !a.zip5) return;
    normByIdx.set(i, {
      county: m.county,
      norm: a.addrNorm,
      house: a.houseNo,
      street: [a.predir, a.street, a.suffix].filter(Boolean).join(" "),
      zip: a.zip5,
    });
  });
  if (normByIdx.size) {
    const norms = [...new Set([...normByIdx.values()].map((v) => v.norm))];
    const rows = await sql<{ addr_norm: string; county_code: string; parcel_key: string }[]>`
      select addr_norm, county_code, min(parcel_key) as parcel_key from parcel
      where addr_norm = any(${norms}) group by addr_norm, county_code`;
    const byNorm = new Map(rows.map((r) => [`${r.county_code}|${r.addr_norm}`, r.parcel_key]));
    for (const [i, v] of normByIdx) {
      const k = byNorm.get(`${v.county}|${v.norm}`);
      if (k) out[i] = { parcel_key: k, method: "address_exact", confidence: 0.95 };
    }
  }

  // 3. Fuzzy: same house number + zip, street similarity >= 0.8 (ordinals ignored), exactly one candidate.
  for (const [i, v] of normByIdx) {
    if (out[i]) continue;
    const rows = await sql<{ parcel_key: string }[]>`
      select parcel_key from parcel
      where county_code = ${v.county} and zip = ${v.zip} and addr_norm like ${`${v.house} %`}
        and similarity(
          regexp_replace(regexp_replace(split_part(addr_norm, '|', 1), '^\\S+\\s', ''), '(\\d+)(ST|ND|RD|TH)\\M', '\\1', 'g'),
          ${stripOrdinals(v.street)}) >= 0.8
      limit 2`;
    if (rows.length === 1) out[i] = { parcel_key: rows[0]!.parcel_key, method: "address_fuzzy", confidence: 0.8 };
  }

  // 4. Geo: within 30 m of a parcel centroid with the same house number.
  for (let i = 0; i < inputs.length; i++) {
    const m = inputs[i]!;
    if (out[i] || m.lon == null || m.lat == null || !m.addrLine) continue;
    const house = normalizeAddress(m.addrLine, m.zip).houseNo;
    if (!house) continue;
    const rows = await sql<{ parcel_key: string }[]>`
      with pt as (select st_setsrid(st_makepoint(${m.lon}, ${m.lat}), 4326) as g)
      select p.parcel_key from parcel p, pt
      where p.county_code = ${m.county} and p.geom && st_expand(pt.g, 0.0006)
        and st_dwithin(p.geom::geography, pt.g::geography, 30)
        and split_part(p.addr_line, ' ', 1) = ${house}
      order by p.geom <-> pt.g limit 1`;
    if (rows[0]) out[i] = { parcel_key: rows[0].parcel_key, method: "geo", confidence: 0.7 };
  }

  return out;
}
