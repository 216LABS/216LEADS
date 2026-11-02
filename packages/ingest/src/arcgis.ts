// Shared ArcGIS REST adapter (spec 5.0).
import { politeFetch } from "./http";

export interface ArcField {
  name: string;
  type: string;
}

export interface LayerInfo {
  name: string;
  maxRecordCount: number;
  objectIdField: string;
  fields: ArcField[];
}

export interface ArcFeature {
  attributes: Record<string, unknown>;
  geometry?: { x?: number; y?: number; rings?: number[][][] } | null;
  centroid?: { x: number; y: number } | null;
}

interface QueryResponse {
  features?: ArcFeature[];
  exceededTransferLimit?: boolean;
  count?: number;
  error?: { code: number; message: string; details?: string[] };
}

async function getJson(url: string): Promise<QueryResponse & Record<string, unknown>> {
  // ArcGIS reports some failures as HTTP 200 with an error body; retry those a few times.
  // Long queries (big IN lists) go as a form POST; ArcGIS Online rejects very long URLs.
  const long = url.length > 1800;
  const [base, query] = long ? [url.slice(0, url.indexOf("?")), url.slice(url.indexOf("?") + 1)] : [url, ""];
  for (let attempt = 0; ; attempt++) {
    const res = long
      ? await politeFetch(base, { method: "POST", body: query, headers: { "Content-Type": "application/x-www-form-urlencoded" } })
      : await politeFetch(url);
    const body = (await res.json()) as QueryResponse & Record<string, unknown>;
    if (!body.error) return body;
    if (attempt >= 2) throw new Error(`ArcGIS error ${body.error.code}: ${body.error.message} (${url})`);
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
}

export async function layerInfo(layerUrl: string): Promise<LayerInfo> {
  const d = await getJson(`${layerUrl}?f=json`);
  const fields = ((d.fields as ArcField[]) ?? []).map((f) => ({ name: f.name, type: String(f.type).replace("esriFieldType", "") }));
  const oid = (d.objectIdField as string) ?? fields.find((f) => f.type === "OID")?.name ?? "OBJECTID";
  return { name: String(d.name ?? ""), maxRecordCount: Number(d.maxRecordCount ?? 1000), objectIdField: oid, fields };
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
}

export async function arcgisCount(layerUrl: string, where: string, extra: Record<string, string> = {}): Promise<number> {
  const d = await getJson(`${layerUrl}/query?${qs({ where, returnCountOnly: true, f: "json", ...extra })}`);
  return Number(d.count ?? 0);
}

export interface PageOpts {
  where: string;
  outFields: string[] | "*";
  returnGeometry?: boolean;
  pageSize?: number;
  orderBy?: string;
  startOffset?: number;
  /** Extra query params (geometry filters, returnCentroid, geometryPrecision...). */
  extra?: Record<string, string>;
}

export interface Page {
  offset: number;
  features: ArcFeature[];
  url: string;
}

/** Page through a layer with resultOffset until a short page without exceededTransferLimit. */
export async function* arcgisPages(layerUrl: string, opts: PageOpts): AsyncGenerator<Page> {
  const pageSize = opts.pageSize ?? 1000;
  let offset = opts.startOffset ?? 0;
  for (;;) {
    const url = `${layerUrl}/query?${qs({
      where: opts.where,
      outFields: opts.outFields === "*" ? "*" : opts.outFields.join(","),
      returnGeometry: opts.returnGeometry ?? false,
      outSR: 4326,
      orderByFields: opts.orderBy ?? "OBJECTID",
      resultOffset: offset,
      resultRecordCount: pageSize,
      f: "json",
      ...(opts.extra ?? {}),
    })}`;
    const d = await getJson(url);
    const features = d.features ?? [];
    yield { offset, features, url };
    if (features.length === 0) return;
    if (features.length < pageSize && !d.exceededTransferLimit) return;
    offset += features.length;
  }
}

/** Remove fields that must never be persisted. Matches exact names and `PREFIX*` patterns. */
export function dropFields<T extends Record<string, unknown>>(attrs: T, drop: string[]): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    const hit = drop.some((d) => (d.endsWith("*") ? k.toUpperCase().startsWith(d.slice(0, -1).toUpperCase()) : k.toUpperCase() === d.toUpperCase()));
    if (!hit) out[k] = v;
  }
  return out as T;
}

export const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const int = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};

export const truthy = (v: unknown): boolean => {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return /^(y|yes|true|t|1|active|current)$/i.test(String(v).trim());
};
