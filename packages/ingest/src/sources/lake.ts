// Lake County: tax parcels + latest sale (5.7) and the Building Inspection monthly permit XLSX (5.8).
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import type { Sql } from "@216leads/db";
import { addDays, addrNormFromParts, normalizeAddress, todayEt, zip5 } from "@216leads/shared";
import { categorize } from "@216leads/scoring";
import { arcgisCount, arcgisPages, dropFields, int, num, str, type ArcFeature } from "../arcgis";
import { politeFetch } from "../http";
import { rawStore } from "../rawstore";
import { withJobRun, type RunCtx, type SourceDef } from "../runtime";
import { writeEvents, type EventInput } from "../events";
import { normalizeParcelId } from "../match";
import { municipalityIds, upsertParcels, type ParcelRow } from "../parcels";

export const LAKE_PARCELS_LAYER = "https://gis.lakecountyohio.gov/arcgis/rest/services/GIS/GIS_Parcels_WGS84/FeatureServer/0";
export const LAKE_PERMITS_LISTING = "https://www.lakecountyohio.gov/building-inspection/monthly-permits/";

/** Owner/taxpayer/seller fields: never requested; A_O_* is fetched only for the owner-occupied compare. */
export const LAKE_DROP = ["A_OWNER_NAME", "A_TAXP_NAME", "A_SELLER", "A_O_*", "A_T_*", "G_O_*", "G_T_*", "A_LEGAL_DESC"];

const OUT_FIELDS = [
  "PIN_NODASH", "A_HOUSENO", "A_ST_PREFIX", "A_ST_NAME", "A_ST_TYPE", "A_ST_SUFFIX", "A_UNITNUM", "A_USPS_CITY", "A_ZIPCODE",
  "G_COMM", "A_ACRES", "A_VAL_TOTAL", "A_PROP_CLASS", "A_YEAR_BUILT", "A_SALE_DATE", "A_SALE_AMOUNT", "G_X_COORD_DD", "G_Y_COORD_DD",
  "A_O_HOUSENO", "A_O_ST_NAME", "A_O_ZIPCODE",
];

export const lakeParcelsSource: SourceDef = {
  code: "lake_parcels",
  name: "Lake County parcels + sales",
  url: LAKE_PARCELS_LAYER,
  schedule_cron: "45 4 * * *",
  notes: "Delta (recent sales) daily 04:45 ET; full refresh weekly.",
};

export const lakePermitsSource: SourceDef = {
  code: "lake_permits_xlsx",
  name: "Lake County Building Inspection monthly permits (XLSX)",
  url: LAKE_PERMITS_LISTING,
  schedule_cron: "0 3 * * 1",
  notes: "Monthly report, about a 3-month lag. Each file is hashed and processed once.",
};

/** "Mentor-on-the-Lake City" and "Mentor on the Lake" are the same town; Township stays (Painesville City vs Township). */
export function lakeMunicipality(raw: string | null | undefined): string | null {
  const s = str(raw)?.toUpperCase().replace(/-/g, " ").replace(/\s+/g, " ").replace(/ (CITY|VILLAGE)$/, "");
  return s && !/^\d+$/.test(s) ? s : null;
}

/** Lake dates are midnight UTC epochs; 1900-01-01 means "no sale". */
function utcDate(ms: number | null): string | null {
  if (ms === null) return null;
  const d = new Date(ms).toISOString().slice(0, 10);
  return d < "1901-01-01" ? null : d;
}

export function parcelFromLake(a: Record<string, unknown>, muniId: number | null): ParcelRow | null {
  const pin = normalizeParcelId("lake", str(a.PIN_NODASH));
  if (!pin) return null;
  const site = addrNormFromParts({
    houseNo: str(a.A_HOUSENO), predir: str(a.A_ST_PREFIX), street: str(a.A_ST_NAME),
    suffix: [str(a.A_ST_TYPE), str(a.A_ST_SUFFIX)].filter(Boolean).join(" "), zip: str(a.A_ZIPCODE),
  });
  let ownerOcc: boolean | null = null;
  const oHouse = str(a.A_O_HOUSENO);
  if (oHouse && site.houseNo) {
    const oZip = zip5(str(a.A_O_ZIPCODE));
    ownerOcc = oHouse.toUpperCase() === site.houseNo
      && (str(a.A_O_ST_NAME) ?? "").toUpperCase() === (str(a.A_ST_NAME) ?? "").toUpperCase()
      && (oZip === "" || oZip === site.zip5);
  }
  const cls = int(a.A_PROP_CLASS);
  const luc = cls === null ? null : String(cls);
  const yr = int(a.A_YEAR_BUILT);
  const thisYear = Number(todayEt().slice(0, 4));
  const lon = num(a.G_X_COORD_DD);
  const lat = num(a.G_Y_COORD_DD);
  return {
    parcel_key: `lake:${pin}`,
    county_code: "lake",
    parcel_id: pin,
    municipality_id: muniId,
    addr_line: site.line,
    addr_unit: str(a.A_UNITNUM),
    city: str(a.A_USPS_CITY)?.toUpperCase() ?? "",
    zip: site.zip5,
    addr_norm: site.addrNorm,
    land_use_code: luc,
    land_use_desc: null,
    is_single_family: luc ? /^51/.test(luc) : null,
    is_condo: luc === "550",
    year_built: yr && yr > 1700 && yr <= thisYear ? yr : null,
    living_sqft: null,
    rooms: null,
    style: null,
    lot_acres: num(a.A_ACRES),
    lot_sqft: null,
    garage_type: null,
    gas_service: null,
    water_source: null,
    sewer_type: null,
    market_value: int(a.A_VAL_TOTAL),
    assessed_value: null,
    owner_occupied_guess: ownerOcc,
    last_sale_date: utcDate(num(a.A_SALE_DATE)),
    last_sale_price: int(a.A_SALE_AMOUNT),
    foreclosure_flag: null,
    tax_delinquent: null,
    data_limited: false,
    source_updated_at: null,
    lon: lon && lat && Math.abs(lon) <= 180 ? lon : null,
    lat: lon && lat && Math.abs(lat) <= 90 ? lat : null,
  };
}

export function lakeSaleEvent(p: ParcelRow): EventInput | null {
  if (!p.last_sale_date) return null;
  const price = p.last_sale_price ?? 0;
  return {
    source: "lake_sales",
    source_record_id: `${p.parcel_id}:${p.last_sale_date}`,
    kind: "sale",
    event_date: p.last_sale_date,
    amount: price,
    arms_length: price >= 10_000,
    parcel_key: p.parcel_key,
    source_url: lakeRecordUrl(p.parcel_id),
  };
}

export function lakeRecordUrl(pin: string): string {
  const fields = "PIN,G_FULLADDRESS,G_COMM,A_YEAR_BUILT,A_ACRES,A_VAL_TOTAL,A_PROP_CLASS,A_SALE_DATE,A_SALE_AMOUNT";
  return `${LAKE_PARCELS_LAYER}/query?where=${encodeURIComponent(`PIN_NODASH='${pin}'`)}&outFields=${fields}&returnGeometry=false&f=html`;
}

async function ingestLakeFeatures(sql: Sql, ctx: RunCtx, features: ArcFeature[], offset: number) {
  const attrs = features.map((f) => f.attributes);
  const names = attrs.map((a) => lakeMunicipality(str(a.G_COMM)) ?? "UNKNOWN");
  const muni = await municipalityIds(sql, "lake", names);
  const parcels = attrs
    .map((a, i) => parcelFromLake(a, muni.get(names[i]!) ?? null))
    .filter((p): p is ParcelRow => p !== null);
  ctx.meta.last_raw = rawStore().put(lakeParcelsSource.code, offset, attrs.map((a) => dropFields(a, LAKE_DROP)));
  ctx.rowsIn += parcels.length;
  ctx.rowsUpserted += await upsertParcels(sql, parcels, { withGeom: true });
  const r = await writeEvents(sql, parcels.map(lakeSaleEvent).filter((e): e is EventInput => e !== null));
  ctx.meta.sale_events_upserted = Number(ctx.meta.sale_events_upserted ?? 0) + r.upserted;
}

export async function runLakeParcels(sql: Sql, o: { full?: boolean; limit?: number } = {}) {
  return withJobRun(sql, { job: "ingest", source: lakeParcelsSource }, async (ctx) => {
    const today = todayEt();
    const lastFull = ctx.cursor.last_full as string | undefined;
    const isFull = o.full || !lastFull || lastFull <= addDays(today, -7);
    // The layer has no update stamp, so the daily delta is recent sales; attributes refresh weekly.
    const where = isFull ? "1=1" : `A_SALE_DATE >= DATE '${addDays(today, -21)}'`;
    const expected = await arcgisCount(LAKE_PARCELS_LAYER, where);
    ctx.meta.expected = expected;
    ctx.meta.mode = isFull ? "full" : "delta";
    ctx.log(`${isFull ? "full" : "delta"} load, expecting ${expected} rows`);
    let n = 0;
    for await (const page of arcgisPages(LAKE_PARCELS_LAYER, { where, outFields: OUT_FIELDS, pageSize: 1000, orderBy: "OBJECTID" })) {
      const feats = o.limit ? page.features.slice(0, Math.max(0, o.limit - n)) : page.features;
      if (feats.length) await ingestLakeFeatures(sql, ctx, feats, page.offset);
      n += feats.length;
      if (page.offset % 20000 === 0) ctx.log(`${n}/${expected}`);
      if (o.limit && n >= o.limit) break;
    }
    if (isFull && !o.limit) ctx.cursor.last_full = today;
    ctx.cursor.last_run = today;
    if (!o.limit && n < expected * 0.98) ctx.status = "partial";
  });
}

// ---------------------------------------------------------------------------
// 5.8 Monthly permit report (XLSX)

/** Monthly report links on the listing page, oldest first. */
export function lakeReportLinks(html: string): string[] {
  const re = /https:\/\/wpassets\.lakecountyohio\.gov\/wp-content\/uploads\/sites\/10\/\d{4}\/\d{2}\/[^"'\s<>]+\.xlsx/gi;
  return [...new Set(html.match(re) ?? [])].sort((a, b) => a.split("/sites/10/")[1]!.localeCompare(b.split("/sites/10/")[1]!));
}

const HEADER_KEYS: Record<string, string> = {
  permit: "permit", issueddate: "issued", usecode: "use", municipality: "muni", permittype: "type",
  jobdescription: "desc", proposeduse: "proposed", siteaddress: "addr", projectcost: "cost", parcel: "parcel",
  dbaname: "dba", dbaphone: "phone", phone: "phone",
  // Applicant Name is never read (decision 39): it can be the homeowner.
};

export interface LakePermitRow {
  permit: string;
  issued: string | null;
  use: string | null;
  muni: string | null;
  type: string | null;
  desc: string | null;
  proposed: string | null;
  addr: string | null;
  cost: number | null;
  parcel: string | null;
  dba: string | null;
  phone: string | null;
}

function cellText(v: ExcelJS.CellValue): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return str(v.richText.map((t) => t.text).join(""));
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return str(v.text);
    return null;
  }
  return str(v);
}

function usDate(s: string | null): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  return `${y}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
}

/** Read one monthly report. Column order changes between years, so columns are found by header name. */
export async function parseLakeReport(buf: ArrayBuffer | Buffer): Promise<LakePermitRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  const out: LakePermitRow[] = [];
  for (const ws of wb.worksheets) {
    let cols: Map<number, string> | null = null;
    ws.eachRow((row) => {
      const vals = row.values as ExcelJS.CellValue[];
      if (!cols) {
        const m = new Map<number, string>();
        vals.forEach((v, i) => {
          const k = HEADER_KEYS[(cellText(v) ?? "").toLowerCase().replace(/[^a-z]/g, "")];
          if (k) m.set(i, k);
        });
        // Some reports have no Issued Date column; their rows are kept here and counted as skipped later.
        if ([...m.values()].includes("permit") && [...m.values()].includes("muni")) cols = m;
        return;
      }
      const r: Record<string, string | null> = {};
      for (const [i, k] of cols) r[k] = cellText(vals[i]);
      if (!r.permit || !/^\d{6,}$/.test(r.permit)) return; // section labels and blank rows
      out.push({
        permit: r.permit, issued: usDate(r.issued ?? null), use: r.use ?? null, muni: r.muni ?? null, type: r.type ?? null,
        desc: r.desc ?? null, proposed: r.proposed ?? null, addr: r.addr ?? null, cost: num(r.cost), parcel: r.parcel ?? null,
        dba: r.dba ?? null, phone: r.phone ?? null,
      });
    });
  }
  return out;
}

const NOT_A_CONTRACTOR = /^(OWNER|HOMEOWNER|SELF|NONE|N\/?A)$/i;

export function lakePermitEvent(r: LakePermitRow, fileUrl: string): EventInput | null {
  if (!r.issued) return null;
  const rawType = [r.type, r.use].filter(Boolean).join(" / ") || null;
  const dba = r.dba && !NOT_A_CONTRACTOR.test(r.dba.trim()) ? r.dba : null;
  const phone = r.phone && /\d{3}.*\d{4}/.test(r.phone) ? r.phone.trim() : null;
  // "0" and other short placeholders mean no parcel number; the address fallback takes over.
  const parcel = r.parcel && r.parcel.replace(/[^0-9A-Za-z]/g, "").length >= 8 ? r.parcel : null;
  return {
    source: lakePermitsSource.code,
    source_record_id: r.permit,
    kind: "permit",
    event_date: r.issued,
    raw_type: rawType,
    description: r.desc,
    category: categorize(rawType, r.desc),
    amount: r.cost === null ? null : Math.round(r.cost),
    source_url: fileUrl,
    contractor: dba ? { name: dba, is_individual: false, phone } : null,
    match: { county: "lake", parcelId: parcel, addrLine: r.addr },
    payload: { ...r, dba: undefined, phone: undefined },
  };
}

/** The report has no ZIP. Where the parcel number is missing, take the ZIP of the one Lake home at that street address in that town. */
async function fillLakeZips(sql: Sql, events: EventInput[], munis: (string | null)[]) {
  const want = events.map((e, i) => ({ e, muni: munis[i], line: e.match?.addrLine ? normalizeAddress(e.match.addrLine).line : "" }))
    .filter((x) => x.line && x.muni && !normalizeParcelId("lake", x.e.match?.parcelId));
  if (!want.length) return;
  const rows = await sql<{ line: string; muni: string; zip: string }[]>`
    select split_part(p.addr_norm, '|', 1) as line, m.name as muni, min(p.zip) as zip from parcel p
    join municipality m on m.id = p.municipality_id
    where p.county_code = 'lake' and split_part(p.addr_norm, '|', 1) = any(${want.map((w) => w.line)})
    group by 1, 2 having count(distinct p.zip) = 1`;
  const zip = new Map(rows.map((r) => [`${r.line}|${r.muni}`, r.zip]));
  for (const w of want) {
    const z = zip.get(`${w.line}|${w.muni}`);
    if (z) w.e.match!.zip = z;
  }
}

export async function runLakePermits(sql: Sql, o: { full?: boolean; limit?: number } = {}) {
  return withJobRun(sql, { job: "ingest", source: lakePermitsSource }, async (ctx) => {
    const html = await (await politeFetch(LAKE_PERMITS_LISTING)).text();
    const links = lakeReportLinks(html);
    const seen = (o.full ? {} : (ctx.cursor.files as Record<string, string> | undefined) ?? {}) as Record<string, string>;
    ctx.meta.files_listed = links.length;
    let files = 0;
    const towns = new Set<string>();
    for (const url of links) {
      if (seen[url] && !o.full) continue;
      const buf = Buffer.from(await (await politeFetch(url)).arrayBuffer());
      const hash = createHash("sha256").update(buf).digest("hex");
      if (Object.values(seen).includes(hash)) {
        seen[url] = hash; // same file re-uploaded under a new name
        continue;
      }
      let rows = await parseLakeReport(buf);
      if (o.limit) rows = rows.slice(0, o.limit);
      const kept = rows.map((r) => ({ r, e: lakePermitEvent(r, url) })).filter((x): x is { r: LakePermitRow; e: EventInput } => x.e !== null);
      ctx.meta.skipped_no_date = Number(ctx.meta.skipped_no_date ?? 0) + rows.length - kept.length;
      const munis = kept.map((k) => lakeMunicipality(k.r.muni));
      munis.forEach((m) => m && towns.add(m));
      await fillLakeZips(sql, kept.map((k) => k.e), munis);
      rawStore().put(lakePermitsSource.code, hash.slice(0, 16), kept.map((k) => k.e.payload));
      const res = await writeEvents(sql, kept.map((k) => k.e));
      ctx.rowsIn += kept.length;
      ctx.rowsUpserted += res.upserted;
      ctx.rowsUnmatched += res.unmatched;
      seen[url] = hash;
      files++;
      ctx.log(`${url.split("/").pop()}: ${kept.length} permits, ${res.unmatched} unmatched`);
      if (o.limit) break;
    }
    ctx.meta.files_processed = files;
    if (!o.limit) ctx.cursor.files = seen;
    // Coverage: towns that appear in the report are served by County Building Inspection.
    if (towns.size) {
      await municipalityIds(sql, "lake", [...towns]);
      await sql`update municipality set permits_source = ${lakePermitsSource.code}, data_tier = 'monthly_list',
        permits_since = coalesce((select extract(year from min(event_date))::int from parcel_event where source = ${lakePermitsSource.code}), 2021)
        where county_code = 'lake' and name = any(${[...towns]})`;
    }
  });
}
