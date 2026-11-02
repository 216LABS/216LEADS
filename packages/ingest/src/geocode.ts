// US Census batch geocoder (free, no key) for stub parcels from lists that carry no coordinates.
import { politeFetch } from "./http";

export const CENSUS_BATCH_URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch";

export interface GeocodeInput {
  id: string;
  street: string;
  city: string;
  zip?: string;
}

export interface GeocodeHit {
  lon: number;
  lat: number;
  city: string;
  zip: string;
}

function csvCell(s: string): string {
  return `"${s.replace(/"/g, "")}"`;
}

/** Parse the batch response: "id","input","Match","Exact","1 MAIN ST, CITY, OH, 44000","-81.1,41.1",... */
export function parseCensusBatch(text: string): Map<string, GeocodeHit> {
  const out = new Map<string, GeocodeHit>();
  for (const line of text.split(/\r?\n/)) {
    const cells = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]!);
    if (cells.length < 6 || cells[2] !== "Match") continue;
    const [lon, lat] = cells[5]!.split(",").map(Number);
    const parts = cells[4]!.split(",").map((s) => s.trim());
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    out.set(cells[0]!, { lon: lon!, lat: lat!, city: parts[1] ?? "", zip: (parts[3] ?? "").slice(0, 5) });
  }
  return out;
}

export async function censusBatch(rows: GeocodeInput[]): Promise<Map<string, GeocodeHit>> {
  const out = new Map<string, GeocodeHit>();
  for (let i = 0; i < rows.length; i += 5000) {
    const csv = rows.slice(i, i + 5000).map((r) => [r.id, r.street, r.city, "OH", r.zip ?? ""].map(csvCell).join(",")).join("\n");
    const form = new FormData();
    form.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
    form.append("benchmark", "Public_AR_Current");
    const res = await politeFetch(CENSUS_BATCH_URL, { method: "POST", body: form, timeoutMs: 300_000 });
    for (const [k, v] of parseCensusBatch(await res.text())) out.set(k, v);
  }
  return out;
}

export interface Bbox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

const inBox = (h: GeocodeHit, b: Bbox) => h.lon >= b.minLon && h.lon <= b.maxLon && h.lat >= b.minLat && h.lat <= b.maxLat;

/** One point per row when every candidate city that matches puts it in the same spot (about 100 m) inside the box. */
async function tryCities(rows: GeocodeInput[], citiesFor: (r: GeocodeInput) => string[], box: Bbox): Promise<Map<string, GeocodeHit>> {
  const out = new Map<string, GeocodeHit>();
  const tries = rows.flatMap((r) => citiesFor(r).map((c, j) => ({ ...r, id: `${r.id}~${j}`, city: c })));
  if (!tries.length) return out;
  const byRow = new Map<string, GeocodeHit[]>();
  for (const [k, h] of await censusBatch(tries)) {
    if (!inBox(h, box)) continue;
    const id = k.slice(0, k.lastIndexOf("~"));
    byRow.set(id, [...(byRow.get(id) ?? []), h]);
  }
  for (const [id, hits] of byRow) {
    const h0 = hits[0]!;
    if (hits.every((h) => Math.abs(h.lon - h0.lon) < 0.0012 && Math.abs(h.lat - h0.lat) < 0.0009)) out.set(id, h0);
  }
  return out;
}

/**
 * Geocode with the given town name first. Township names aren't postal cities, so unplaced rows
 * are tried against the township's usual postal cities (`hints`), then all of the county's.
 */
export async function geocodeInCounty(
  rows: GeocodeInput[], postalCities: string[], box: Bbox, hints: Record<string, string[]> = {},
): Promise<Map<string, GeocodeHit>> {
  const out = new Map<string, GeocodeHit>();
  for (const [id, h] of await censusBatch(rows)) if (inBox(h, box)) out.set(id, h);
  const hinted = rows.filter((r) => !out.has(r.id) && hints[r.city.toUpperCase()]);
  for (const [id, h] of await tryCities(hinted, (r) => hints[r.city.toUpperCase()]!, box)) out.set(id, h);
  const rest = rows.filter((r) => !out.has(r.id));
  for (const [id, h] of await tryCities(rest, () => postalCities, box)) out.set(id, h);
  return out;
}
