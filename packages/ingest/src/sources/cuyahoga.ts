// Cuyahoga County: tax parcels + sale events (5.1), parcel centroids (5.2), CCPC canopy (5.3).
import type { Sql } from "@216leads/db";
import {
  addDays, addrNormFromParts, epochToEtDate, municipalityFromTaxDistrict, normalizeAddress, todayEt, zip5,
} from "@216leads/shared";
import { arcgisCount, arcgisPages, dropFields, int, num, str, type ArcFeature } from "../arcgis";
import { rawStore } from "../rawstore";
import { withJobRun, type RunCtx, type SourceDef } from "../runtime";
import { writeEvents, type EventInput } from "../events";
import { upsertParcels, municipalityIds, type ParcelRow } from "../parcels";

export const CUY_PARCELS_LAYER = "https://gis.cuyahogacounty.gov/server/rest/services/CCFO/Parcel_Fabric_Taxparcels/FeatureServer/1";
export const CUY_PARCEL_POLY_LAYER = "https://gis.cuyahogacounty.gov/server/rest/services/CCFO/Parcel_Fabric_Taxparcels/FeatureServer/0";
export const CUY_PARCEL_POLY_ALT = "https://gis.cuyahogacounty.gov/server/rest/services/CCFO/Open_Data_Parcels/MapServer/0";
export const CCPC_CANOPY_LAYER = "https://gis.cuyahogacounty.gov/server/rest/services/CCPC/UTC2019_Metrics_Final/MapServer/0";

export const RESIDENTIAL_LUC = ["5100", "5200", "5300", "5500"];

/** Owner/person fields: never requested, and stripped again before anything is stored. */
export const CUY_DROP = ["parcel_owner", "second_owner", "grantor", "grantee", "mail_name", "lender", "legal_description"];
/** Mailing address: fetched only to compare with the site address, then discarded. */
const CUY_MAIL = ["mail_addr_street", "mail_unit_no", "mail_city", "mail_state", "mail_zip", "mail_country"];

const OUT_FIELDS = [
  "parcel_id", "parcel_addr", "parcel_predir", "parcel_street", "parcel_suffix", "parcel_unit", "parcel_city", "parcel_zip",
  "par_addr_all", "tax_dist_desc", "mail_addr_street", "mail_city", "mail_zip", "last_transfer_date", "last_sales_amount",
  "tax_luc", "tax_luc_description", "max_age", "total_res_liv_area", "total_res_rooms", "res_styles", "parcel_acreage",
  "parcel_lot_size", "garage_type", "gas", "water", "sewer", "tax_market_total", "tax_assessed_total", "foreclosure_flag",
  "total_net_delq_balance", "update_date", "condo_complex_id",
];

export const cuyParcelsSource: SourceDef = {
  code: "cuy_parcels",
  name: "Cuyahoga County tax parcels + sales",
  url: CUY_PARCELS_LAYER,
  schedule_cron: "30 4 * * *",
  notes: "Delta daily 04:30 ET; full refresh Sunday 02:00 ET.",
};

export interface ScopeOpts {
  full?: boolean;
  /** Restrict to these zips (fixtures, quick local loads). */
  zips?: string[];
  /** Restrict to a postal city, e.g. CLEVELAND. */
  city?: string;
  /** Stop after this many rows (fixtures). */
  limit?: number;
}

function scopeWhere(base: string, o: ScopeOpts): string {
  const parts = [base];
  if (o.zips?.length) parts.push(`parcel_zip IN (${o.zips.map((z) => `'${z.replace(/\D/g, "")}'`).join(",")})`);
  if (o.city) parts.push(`parcel_city = '${o.city.replace(/'/g, "").toUpperCase()}'`);
  return parts.map((p) => `(${p})`).join(" AND ");
}

/** Map one county parcel record to our row. Mail fields are used for the owner-occupied guess only. */
export function parcelFromCuyahoga(a: Record<string, unknown>, muniId: number | null): ParcelRow | null {
  const parcelId = str(a.parcel_id);
  if (!parcelId) return null;
  const site = addrNormFromParts({
    houseNo: str(a.parcel_addr), predir: str(a.parcel_predir), street: str(a.parcel_street), suffix: str(a.parcel_suffix), zip: str(a.parcel_zip),
  });
  let ownerOcc: boolean | null = null;
  const mailStreet = str(a.mail_addr_street);
  if (mailStreet && site.houseNo) {
    const mail = normalizeAddress(mailStreet, str(a.mail_zip));
    ownerOcc = mail.line === site.line && (mail.zip5 === "" || mail.zip5 === site.zip5);
  }
  const luc = str(a.tax_luc);
  const yr = int(a.max_age);
  const thisYear = Number(todayEt().slice(0, 4));
  return {
    parcel_key: `cuyahoga:${parcelId.toUpperCase()}`,
    county_code: "cuyahoga",
    parcel_id: parcelId.toUpperCase(),
    municipality_id: muniId,
    addr_line: site.line || (str(a.par_addr_all)?.split(",")[0] ?? ""),
    addr_unit: str(a.parcel_unit),
    city: str(a.parcel_city) ?? "",
    zip: zip5(str(a.parcel_zip)),
    addr_norm: site.addrNorm,
    land_use_code: luc,
    land_use_desc: str(a.tax_luc_description),
    is_single_family: luc === "5100",
    is_condo: luc === "5500" || !!str(a.condo_complex_id),
    year_built: yr && yr > 1700 && yr <= thisYear ? yr : null,
    living_sqft: int(a.total_res_liv_area) || null,
    rooms: int(a.total_res_rooms) || null,
    style: str(a.res_styles),
    lot_acres: num(a.parcel_acreage),
    lot_sqft: int(a.parcel_lot_size) || null,
    garage_type: str(a.garage_type),
    gas_service: str(a.gas) === "Y" ? true : str(a.gas) === "N" ? false : null,
    water_source: str(a.water),
    sewer_type: str(a.sewer),
    market_value: int(a.tax_market_total),
    assessed_value: int(a.tax_assessed_total),
    owner_occupied_guess: ownerOcc,
    last_sale_date: epochToEtDate(num(a.last_transfer_date)),
    last_sale_price: int(a.last_sales_amount),
    foreclosure_flag: int(a.foreclosure_flag) === 1,
    tax_delinquent: (num(a.total_net_delq_balance) ?? 0) > 0,
    data_limited: false,
    source_updated_at: num(a.update_date) ? new Date(num(a.update_date)!).toISOString() : null,
  };
}

/** Sale event for the county's latest transfer (5.1). Arms-length = price >= $10,000. */
export function saleEventFromParcel(p: ParcelRow): EventInput | null {
  if (!p.last_sale_date) return null;
  const price = p.last_sale_price ?? 0;
  return {
    source: "cuy_sales",
    source_record_id: `${p.parcel_id}:${p.last_sale_date}`,
    kind: "sale",
    event_date: p.last_sale_date,
    amount: price,
    arms_length: price >= 10_000,
    parcel_key: p.parcel_key,
    source_url: cuyRecordUrl(p.parcel_id),
  };
}

/** Public county record for one parcel (no owner fields), used as evidence links. */
export function cuyRecordUrl(parcelId: string): string {
  const fields = "parcel_id,par_addr_all,max_age,res_styles,total_res_liv_area,parcel_acreage,last_transfer_date,last_sales_amount,gas,water,sewer,tax_market_total";
  return `${CUY_PARCELS_LAYER}/query?where=${encodeURIComponent(`parcel_id='${parcelId}'`)}&outFields=${fields}&returnGeometry=false&f=html`;
}

export function ccpcRecordUrl(parcelId: string): string {
  return `${CCPC_CANOPY_LAYER}/query?where=${encodeURIComponent(`PARCELPIN='${parcelId}'`)}&outFields=PARCELPIN,Can_P,Grass_P,Imperv_P&returnGeometry=false&f=html`;
}

async function ingestParcelFeatures(sql: Sql, ctx: RunCtx, features: ArcFeature[], offset: number, source: string) {
  const attrs = features.map((f) => f.attributes);
  const muniNames = attrs.map((a) => municipalityFromTaxDistrict(str(a.tax_dist_desc), str(a.parcel_city)));
  const muni = await municipalityIds(sql, "cuyahoga", muniNames);
  const parcels: ParcelRow[] = [];
  attrs.forEach((a, i) => {
    const p = parcelFromCuyahoga(a, muni.get(muniNames[i]!) ?? null);
    if (p) parcels.push(p);
  });
  // Raw page after DROP and mail fields are removed.
  ctx.meta.last_raw = rawStore().put(source, offset, attrs.map((a) => dropFields(a, [...CUY_DROP, ...CUY_MAIL])));
  ctx.rowsIn += parcels.length;
  ctx.rowsUpserted += await upsertParcels(sql, parcels);
  const sales = parcels.map(saleEventFromParcel).filter((e): e is EventInput => e !== null);
  const r = await writeEvents(sql, sales);
  ctx.meta.sale_events_upserted = Number(ctx.meta.sale_events_upserted ?? 0) + r.upserted;
}

export async function runCuyParcels(sql: Sql, o: ScopeOpts = {}) {
  return withJobRun(sql, { job: "ingest", source: cuyParcelsSource }, async (ctx) => {
    const today = todayEt();
    const isFull = o.full || !ctx.cursor.last_full;
    const base = isFull
      ? "1=1"
      : `update_date >= DATE '${addDays(today, -3)}' OR last_transfer_date >= DATE '${addDays(today, -21)}'`;
    const where = scopeWhere(base, o);
    const expected = await arcgisCount(CUY_PARCELS_LAYER, where);
    ctx.meta.expected = expected;
    ctx.meta.mode = isFull ? "full" : "delta";
    ctx.log(`${isFull ? "full" : "delta"} load, expecting ${expected} rows`);
    let n = 0;
    for await (const page of arcgisPages(CUY_PARCELS_LAYER, { where, outFields: OUT_FIELDS, pageSize: 2000, orderBy: "ObjectID" })) {
      const feats = o.limit ? page.features.slice(0, Math.max(0, o.limit - n)) : page.features;
      if (feats.length) await ingestParcelFeatures(sql, ctx, feats, page.offset, cuyParcelsSource.code);
      n += feats.length;
      if (page.offset % 20000 === 0) ctx.log(`${n}/${expected}`);
      if (o.limit && n >= o.limit) break;
    }
    if (isFull && !o.zips && !o.city && !o.limit) ctx.cursor.last_full = today;
    ctx.cursor.last_run = today;
    if (!o.limit && n < expected * 0.98) ctx.status = "partial";
  });
}

// ---------------------------------------------------------------------------
// 5.2 Parcel centroids

export const cuyGeomSource: SourceDef = {
  code: "cuy_parcel_geom",
  name: "Cuyahoga parcel centroids",
  url: CUY_PARCEL_POLY_LAYER,
  schedule_cron: "0 3 * * 0",
};

export function ringCentroid(rings: number[][][]): [number, number] | null {
  // Area-weighted centroid of the largest ring; good enough for a point on a house lot.
  let best: number[][] | null = null;
  let bestArea = 0;
  for (const r of rings) {
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j]![0]! * r[i]![1]! - r[i]![0]! * r[j]![1]!;
    if (Math.abs(a) > bestArea) {
      bestArea = Math.abs(a);
      best = r;
    }
  }
  if (!best || best.length < 3) return null;
  let cx = 0, cy = 0, a2 = 0;
  for (let i = 0, j = best.length - 1; i < best.length; j = i++) {
    const f = best[j]![0]! * best[i]![1]! - best[i]![0]! * best[j]![1]!;
    cx += (best[j]![0]! + best[i]![0]!) * f;
    cy += (best[j]![1]! + best[i]![1]!) * f;
    a2 += f;
  }
  if (a2 === 0) return [best[0]![0]!, best[0]![1]!];
  return [cx / (3 * a2), cy / (3 * a2)];
}

export async function runCuyParcelGeom(sql: Sql, o: ScopeOpts = {}) {
  return withJobRun(sql, { job: "ingest", source: cuyGeomSource }, async (ctx) => {
    // Only fetch polygons for parcels we have, scoped like the parcel load.
    const scoped = o.zips?.length || o.city;
    let ids: string[] | null = null;
    if (scoped) {
      ids = (await sql<{ parcel_id: string }[]>`
        select parcel_id from parcel where county_code = 'cuyahoga'
          and (${o.zips ?? null}::text[] is null or zip = any(${o.zips ?? null}::text[]))
          and (${o.city ?? null}::text is null or city = ${o.city?.toUpperCase() ?? null})`).map((r) => r.parcel_id);
    }
    const chunks: string[] = ids ? [] : ["1=1"];
    if (ids) for (let i = 0; i < ids.length; i += 400) chunks.push(`PARCELPIN IN (${ids.slice(i, i + 400).map((x) => `'${x}'`).join(",")})`);
    for (const where of chunks) {
      for await (const page of arcgisPages(CUY_PARCEL_POLY_LAYER, {
        where, outFields: ["PARCELPIN"], returnGeometry: true, pageSize: 1000, orderBy: "OBJECTID",
        extra: { geometryPrecision: "6", maxAllowableOffset: "0.00002" },
      })) {
        const rows: { parcel_key: string; lon: number; lat: number }[] = [];
        for (const f of page.features) {
          const pin = str(f.attributes.PARCELPIN ?? f.attributes.parcelpin);
          const c = f.geometry?.rings ? ringCentroid(f.geometry.rings) : null;
          if (pin && c) rows.push({ parcel_key: `cuyahoga:${pin.toUpperCase()}`, lon: c[0], lat: c[1] });
        }
        ctx.rowsIn += rows.length;
        if (!rows.length) continue;
        const res = await sql`
          update parcel p set geom = st_setsrid(st_makepoint(x.lon, x.lat), 4326), updated_at = now()
          from jsonb_to_recordset(${sql.json(rows as never)}) as x(parcel_key text, lon float8, lat float8)
          where p.parcel_key = x.parcel_key
            and (p.geom is null or st_distance(p.geom, st_setsrid(st_makepoint(x.lon, x.lat), 4326)) > 0.000001)`;
        ctx.rowsUpserted += res.count;
        if (page.offset % 50000 === 0) ctx.log(`${ctx.rowsIn} centroids`);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// 5.3 CCPC tree canopy + land cover

export const cuyCanopySource: SourceDef = {
  code: "cuy_canopy",
  name: "CCPC tree canopy (UTC 2019) per parcel",
  url: CCPC_CANOPY_LAYER,
  schedule_cron: "0 2 2 1 *",
};

export async function runCuyCanopy(sql: Sql, o: ScopeOpts = {}) {
  return withJobRun(sql, { job: "ingest", source: cuyCanopySource }, async (ctx) => {
    const scoped = o.zips?.length || o.city;
    const chunks: string[] = [];
    if (scoped) {
      const ids = (await sql<{ parcel_id: string }[]>`
        select parcel_id from parcel where county_code = 'cuyahoga'
          and (${o.zips ?? null}::text[] is null or zip = any(${o.zips ?? null}::text[]))
          and (${o.city ?? null}::text is null or city = ${o.city?.toUpperCase() ?? null})`).map((r) => r.parcel_id);
      for (let i = 0; i < ids.length; i += 400) chunks.push(`PARCELPIN IN (${ids.slice(i, i + 400).map((x) => `'${x}'`).join(",")})`);
    } else chunks.push("1=1");
    ctx.meta.expected = scoped ? null : await arcgisCount(CCPC_CANOPY_LAYER, "1=1");
    for (const where of chunks) {
      for await (const page of arcgisPages(CCPC_CANOPY_LAYER, {
        where, outFields: ["PARCELPIN", "Can_P", "Grass_P", "Imperv_P"], pageSize: 2000, orderBy: "OBJECTID",
      })) {
        const rows = page.features
          .map((f) => f.attributes)
          .filter((a) => str(a.PARCELPIN))
          .map((a) => ({
            parcel_key: `cuyahoga:${str(a.PARCELPIN)!.toUpperCase()}`,
            canopy: num(a.Can_P) === null ? null : Math.round(num(a.Can_P)! * 100) / 100,
            grass: num(a.Grass_P) === null ? null : Math.round(num(a.Grass_P)! * 100) / 100,
            imperv: num(a.Imperv_P) === null ? null : Math.round(num(a.Imperv_P)! * 100) / 100,
          }));
        ctx.rowsIn += rows.length;
        if (!rows.length) continue;
        const res = await sql`
          update parcel p set canopy_pct = x.canopy, grass_pct = x.grass, impervious_pct = x.imperv, updated_at = now()
          from jsonb_to_recordset(${sql.json(rows as never)}) as x(parcel_key text, canopy numeric, grass numeric, imperv numeric)
          where p.parcel_key = x.parcel_key
            and (p.canopy_pct, p.grass_pct, p.impervious_pct) is distinct from (x.canopy, x.grass, x.imperv)`;
        ctx.rowsUpserted += res.count;
        if (page.offset % 50000 === 0) ctx.log(`${ctx.rowsIn} canopy rows`);
      }
    }
  });
}
