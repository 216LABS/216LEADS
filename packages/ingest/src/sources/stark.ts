// Stark County Auditor sales (5.10), with stub parcels from the sale polygon.
import type { Sql } from "@216leads/db";
import { addDays, epochToEtDate, normalizeAddress, todayEt } from "@216leads/shared";
import { arcgisCount, arcgisPages, dropFields, int, num, str, type ArcFeature } from "../arcgis";
import { rawStore } from "../rawstore";
import { withJobRun, type RunCtx, type SourceDef } from "../runtime";
import { writeEvents, type EventInput } from "../events";
import { normalizeParcelId } from "../match";
import { municipalityIds, upsertParcels, type ParcelRow } from "../parcels";
import { ringCentroid } from "./cuyahoga";

export const STARK_SALES_LAYER = "https://scgisa.starkcountyohio.gov/arcgis/rest/services/Auditor/StarkCountySales/FeatureServer/0";
export const STARK_DROP = ["FORMER_OWNER", "NEW_OWNER"];

const OUT_FIELDS = [
  "PARID", "SITE_ADDRESS", "TRANSFER_DATE", "SALE_PRICE", "NUMBER_OF_PARCELS", "ARMS_LENGTH", "INSTR_TYPE_DESC",
  "SALE_VALIDITY", "SALE_TYPE", "CONVEYANCE_NUMBER", "INSTRUMENT_NUMBER", "UpdatedDate",
];

export const starkSalesSource: SourceDef = {
  code: "stark_sales",
  name: "Stark County sales",
  url: STARK_SALES_LAYER,
  schedule_cron: "15 5 * * *",
  notes: "Delta daily 05:15 ET on TRANSFER_DATE/UpdatedDate; stub parcels are limited-data (no year built or size).",
};

/** Postal cities in Stark addresses, longest first so "NORTH CANTON" wins over "CANTON". */
const STARK_CITIES = [
  "NORTH CANTON", "CANAL FULTON", "EAST CANTON", "EAST SPARTA", "BEACH CITY", "NORTH LAWRENCE", "CANTON", "MASSILLON",
  "ALLIANCE", "LOUISVILLE", "NAVARRE", "BREWSTER", "WILMOT", "HARTVILLE", "UNIONTOWN", "MAGNOLIA", "WAYNESBURG",
  "MINERVA", "ROBERTSVILLE", "LIMAVILLE", "PARIS", "HOMEWORTH", "GREENTOWN", "MOGADORE", "DALTON", "MALVERN",
  "BELOIT", "SEBRING", "BOLIVAR", "STRASBURG", "DELLROY", "CARROLLTON", "MAXIMO", "MIDDLEBRANCH", "WINESBURG",
].sort((a, b) => b.length - a.length);

/** " 761 ELM RIDGE AVE CANAL FULTON OH 44614 9380" -> street line, city, zip. */
export function parseStarkAddress(raw: string | null): { line: string; city: string; zip: string } | null {
  const s = str(raw)?.toUpperCase().replace(/\s+/g, " ");
  const m = s?.match(/^(.*) OH (\d{5})(?: \d{4})?$/);
  if (!m) return null;
  const head = m[1]!;
  const city = STARK_CITIES.find((c) => head === c || head.endsWith(` ${c}`));
  const line = city ? head.slice(0, head.length - city.length).trim() : head.slice(0, head.lastIndexOf(" ")).trim();
  const cityOut = city ?? head.slice(head.lastIndexOf(" ") + 1);
  return line ? { line, city: cityOut, zip: m[2]! } : null;
}

export function starkSaleEvent(a: Record<string, unknown>, parcelKey: string): EventInput | null {
  const date = epochToEtDate(num(a.TRANSFER_DATE));
  const parid = str(a.PARID);
  if (!date || !parid) return null;
  const price = int(a.SALE_PRICE) ?? 0;
  const conv = str(a.CONVEYANCE_NUMBER);
  return {
    source: starkSalesSource.code,
    // One conveyance can cover several parcels; each parcel gets its own event.
    source_record_id: conv ? `${parid}:${conv}` : `${parid}:${date}`,
    kind: "sale",
    event_date: date,
    amount: price,
    arms_length: str(a.ARMS_LENGTH) === "Yes" && price >= 10_000,
    raw_type: str(a.SALE_TYPE),
    description: str(a.INSTR_TYPE_DESC),
    parcel_key: parcelKey,
    source_url: `${STARK_SALES_LAYER}/query?where=${encodeURIComponent(`PARID='${parid}'`)}&outFields=PARID,SITE_ADDRESS,TRANSFER_DATE,SALE_PRICE,ARMS_LENGTH,SALE_TYPE&returnGeometry=false&f=html`,
  };
}

/** Stubs only for land-and-building sales at a numbered address: vacant land and unaddressed lots aren't homes. */
export function starkStub(f: ArcFeature): ParcelRow | null {
  const a = f.attributes;
  const pid = normalizeParcelId("stark", str(a.PARID));
  const addr = parseStarkAddress(str(a.SITE_ADDRESS));
  if (!pid || !addr || !/BUILDING/i.test(str(a.SALE_TYPE) ?? "")) return null;
  const n = normalizeAddress(addr.line, addr.zip);
  if (!n.houseNo) return null;
  const c = f.geometry?.rings ? ringCentroid(f.geometry.rings) : null;
  const date = epochToEtDate(num(a.TRANSFER_DATE));
  return {
    parcel_key: `stark:${pid}`, county_code: "stark", parcel_id: pid, municipality_id: null,
    addr_line: n.line, addr_unit: n.unit || null, city: addr.city, zip: n.zip5, addr_norm: n.addrNorm,
    land_use_code: null, land_use_desc: str(a.SALE_TYPE), is_single_family: null, is_condo: false, year_built: null,
    living_sqft: null, rooms: null, style: null, lot_acres: null, lot_sqft: null, garage_type: null, gas_service: null,
    water_source: null, sewer_type: null, market_value: null, assessed_value: null, owner_occupied_guess: null,
    last_sale_date: date, last_sale_price: int(a.SALE_PRICE), foreclosure_flag: null, tax_delinquent: null,
    data_limited: true, source_updated_at: null, lon: c?.[0] ?? null, lat: c?.[1] ?? null,
  };
}

async function ingestStarkPage(sql: Sql, ctx: RunCtx, features: ArcFeature[], offset: number) {
  // Latest sale per parcel on the page wins for the stub's last-sale fields.
  const stubs = new Map<string, ParcelRow>();
  for (const f of features) {
    const s = starkStub(f);
    if (s && (!stubs.has(s.parcel_key) || (s.last_sale_date ?? "") >= (stubs.get(s.parcel_key)!.last_sale_date ?? ""))) stubs.set(s.parcel_key, s);
  }
  const muni = await municipalityIds(sql, "stark", [...stubs.values()].map((s) => s.city));
  for (const s of stubs.values()) s.municipality_id = muni.get(s.city) ?? null;
  ctx.meta.last_raw = rawStore().put(starkSalesSource.code, offset, features.map((f) => dropFields(f.attributes, STARK_DROP)));
  ctx.rowsIn += features.length;
  ctx.rowsUpserted += await upsertParcels(sql, [...stubs.values()], { withGeom: true });
  const events = features
    .map((f) => {
      const pid = normalizeParcelId("stark", str(f.attributes.PARID));
      return pid && stubs.has(`stark:${pid}`) ? starkSaleEvent(f.attributes, `stark:${pid}`) : null;
    })
    .filter((e): e is EventInput => e !== null);
  ctx.meta.skipped_not_home = Number(ctx.meta.skipped_not_home ?? 0) + features.length - events.length;
  const r = await writeEvents(sql, events);
  ctx.meta.sale_events_upserted = Number(ctx.meta.sale_events_upserted ?? 0) + r.upserted;
}

export async function runStarkSales(sql: Sql, o: { full?: boolean; limit?: number; since?: string } = {}) {
  return withJobRun(sql, { job: "ingest", source: starkSalesSource }, async (ctx) => {
    const today = todayEt();
    const isFull = o.full || !ctx.cursor.last_full;
    const since = o.since ?? addDays(today, -14);
    const where = isFull && !o.since ? "1=1" : `TRANSFER_DATE >= DATE '${since}' OR UpdatedDate >= DATE '${since}'`;
    const expected = await arcgisCount(STARK_SALES_LAYER, where);
    ctx.meta.expected = expected;
    ctx.meta.mode = isFull && !o.since ? "full" : "delta";
    ctx.log(`${ctx.meta.mode} load, expecting ${expected} rows`);
    let n = 0;
    // Oldest first, so a parcel's newest sale is written last.
    for await (const page of arcgisPages(STARK_SALES_LAYER, {
      where, outFields: OUT_FIELDS, returnGeometry: true, pageSize: 2000, orderBy: "TRANSFER_DATE,OBJECTID",
      extra: { geometryPrecision: "6", maxAllowableOffset: "0.00002" },
    })) {
      const feats = o.limit ? page.features.slice(0, Math.max(0, o.limit - n)) : page.features;
      if (feats.length) await ingestStarkPage(sql, ctx, feats, page.offset);
      n += feats.length;
      if (page.offset % 20000 === 0) ctx.log(`${n}/${expected}`);
      if (o.limit && n >= o.limit) break;
    }
    // A late-recorded older sale must not replace a newer one on the stub.
    const fixed = await sql`
      update parcel p set last_sale_date = x.d, last_sale_price = x.a, updated_at = now()
      from (select distinct on (parcel_key) parcel_key, event_date as d, amount as a from parcel_event
            where source = 'stark_sales' order by parcel_key, event_date desc, id desc) x
      where p.parcel_key = x.parcel_key and p.county_code = 'stark'
        and (p.last_sale_date, p.last_sale_price) is distinct from (x.d, x.a)`;
    ctx.meta.last_sale_fixed = fixed.count;
    if (isFull && !o.since && !o.limit) ctx.cursor.last_full = today;
    ctx.cursor.last_run = today;
    if (!o.limit && n < expected * 0.98) ctx.status = "partial";
  });
}
