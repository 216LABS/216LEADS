// Medina County Building Department residential permit list (5.9), with stub parcels.
import { createHash } from "node:crypto";
import { parse, type HTMLElement } from "node-html-parser";
import type { Sql } from "@216leads/db";
import { looksLikeIndividual, normalizeAddress } from "@216leads/shared";
import { categorize } from "@216leads/scoring";
import { str } from "../arcgis";
import { politeFetch } from "../http";
import { rawStore } from "../rawstore";
import { withJobRun, type SourceDef } from "../runtime";
import { writeEvents, type EventInput } from "../events";
import { normalizeParcelId } from "../match";
import { municipalityIds, upsertParcels, type ParcelRow } from "../parcels";
import { geocodeInCounty, type Bbox } from "../geocode";

export const MEDINA_PERMITS_URL = "https://building.co.medina.oh.us/permits/permitList.php?code=R";

export const medinaPermitsSource: SourceDef = {
  code: "medina_permits",
  name: "Medina County residential permits (monthly list)",
  url: MEDINA_PERMITS_URL,
  schedule_cron: "30 3 2,5,10 * *",
  notes: "Returns last month's residential permits; deduped by permit number. Stub parcels geocoded with the US Census batch geocoder.",
};

/** Postal cities for township addresses the Census geocoder can't place by township name. */
export const MEDINA_POSTAL_CITIES = [
  "MEDINA", "WADSWORTH", "BRUNSWICK", "HINCKLEY", "VALLEY CITY", "LITCHFIELD", "LODI", "SPENCER", "SEVILLE",
  "WESTFIELD CENTER", "CHIPPEWA LAKE", "HOMERVILLE", "SHARON CENTER", "RITTMAN", "CRESTON", "GRAFTON", "NORTON",
  "DOYLESTOWN", "SULLIVAN", "WELLINGTON",
];
/** Townships -> the postal cities their addresses use. */
export const MEDINA_TOWNSHIP_CITIES: Record<string, string[]> = {
  "BRUNSWICK HILLS": ["BRUNSWICK"], LIVERPOOL: ["VALLEY CITY"], MONTVILLE: ["MEDINA"], SHARON: ["SHARON CENTER", "WADSWORTH"],
  GRANGER: ["MEDINA", "HINCKLEY"], HINCKLEY: ["HINCKLEY"], LAFAYETTE: ["MEDINA", "CHIPPEWA LAKE"], YORK: ["MEDINA"],
  LITCHFIELD: ["LITCHFIELD"], GUILFORD: ["SEVILLE"], WESTFIELD: ["WESTFIELD CENTER", "SEVILLE"], HOMER: ["HOMERVILLE"],
  HARRISVILLE: ["LODI"], SPENCER: ["SPENCER"], WADSWORTH: ["WADSWORTH"], CHATHAM: ["LODI", "SPENCER"], MEDINA: ["MEDINA"],
};
export const MEDINA_BBOX: Bbox = { minLon: -82.14, minLat: 40.98, maxLon: -81.67, maxLat: 41.21 };

export interface MedinaPermit {
  section: string;
  issued: string;
  value: number | null;
  permit: string;
  ppn: string | null;
  projectType: string | null;
  location: string | null;
  town: string | null;
  contractor: string | null;
  electrical: string | null;
}

const decode = (s: string) =>
  s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();

const lines = (td: HTMLElement) => td.innerHTML.split(/<br\s*\/?>/i).map(decode).filter(Boolean);

const firstLine = (td: HTMLElement): string | null => {
  const t = str(decode((td.querySelector("tr") ?? td).innerHTML));
  return t && !/^NONE SPECIFIED$/i.test(t) ? t : null;
};

/**
 * Each permit row has six cells of paired values split by <br>. The owner cell (4th) is never read.
 * Sections ("Building Permits:", "Electrical Permits:", "HVAC Permits:") come before their rows.
 * Electrical and HVAC sub-permits reuse the building permit's number and leave the PPN blank, so
 * rows are keyed by section + permit number and the PPN is filled from the same permit (or the
 * same address) elsewhere in the list.
 */
export function parseMedinaList(html: string): MedinaPermit[] {
  const root = parse(html);
  const out = new Map<string, MedinaPermit>();
  let section = "BUILDING";
  for (const tr of root.querySelectorAll("tr")) {
    const u = tr.querySelector("u");
    const sec = u?.text.match(/^\s*(.+?)\s+Permits:/i);
    if (sec) {
      section = sec[1]!.toUpperCase();
      continue;
    }
    const tds = tr.childNodes.filter((n): n is HTMLElement => (n as HTMLElement).rawTagName?.toLowerCase() === "td");
    if (tds.length !== 6) continue;
    const [dateVal, ids, where] = [lines(tds[0]!), lines(tds[1]!), lines(tds[2]!)];
    const d = dateVal[0]?.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
    const permit = ids[0];
    if (!d || !permit) continue;
    const year = d[3]!.length === 2 ? `20${d[3]}` : d[3]!;
    const value = dateVal[1] ? Number(dateVal[1].replace(/[$,]/g, "")) : NaN;
    out.set(`${section}|${permit}`, {
      section,
      issued: `${year}-${d[1]}-${d[2]}`,
      value: Number.isFinite(value) ? value : null,
      permit,
      ppn: str(ids[1]),
      projectType: str(where[0]),
      location: str(where[1]),
      town: str(where[2]),
      contractor: firstLine(tds[4]!),
      electrical: firstLine(tds[5]!),
    });
  }
  const rows = [...out.values()];
  const byPermit = new Map(rows.filter((r) => r.ppn).map((r) => [r.permit, r.ppn!]));
  const addrKey = (r: MedinaPermit) => `${normalizeAddress(r.location ?? "").line}|${medinaTown(r.town)}`;
  const byAddr = new Map(rows.filter((r) => r.ppn && r.location).map((r) => [addrKey(r), r.ppn!]));
  for (const r of rows) if (!r.ppn) r.ppn = byPermit.get(r.permit) ?? (r.location ? byAddr.get(addrKey(r)) ?? null : null);
  return rows;
}

export function medinaTown(raw: string | null): string | null {
  const s = raw?.toUpperCase().replace(/\s+/g, " ").replace(/ (CITY|VILLAGE|TOWNSHIP|TWP)$/, "").trim();
  return s || null;
}

/** A business name, or null: a person's name (possibly the homeowner) is never stored, even as text. */
const business = (name: string | null) => (name && !looksLikeIndividual(name) ? name : null);

export function medinaPermitEvent(p: MedinaPermit, parcelKey: string | null): EventInput {
  const rawType = [p.section, p.projectType].filter(Boolean).join(" / ");
  const electrical = business(p.electrical);
  const description = [p.projectType, electrical ? `Electrical: ${electrical}` : null].filter(Boolean).join("; ");
  const contractor = business(p.contractor) ?? (p.section === "ELECTRICAL" ? electrical : null);
  return {
    source: medinaPermitsSource.code,
    source_record_id: p.section === "BUILDING" ? p.permit : `${p.permit}:${p.section}`,
    kind: "permit",
    event_date: p.issued,
    raw_type: rawType,
    description,
    category: categorize(rawType, p.projectType),
    amount: p.value === null ? null : Math.round(p.value),
    source_url: MEDINA_PERMITS_URL,
    contractor: contractor ? { name: contractor, is_individual: false } : null,
    parcel_key: parcelKey,
  };
}

function stubParcel(key: string, ppn: string, line: string, muniId: number | null, g: { city: string; zip: string; lon: number | null; lat: number | null }): ParcelRow {
  const a = normalizeAddress(line, g.zip);
  return {
    parcel_key: key, county_code: "medina", parcel_id: ppn, municipality_id: muniId,
    addr_line: a.line, addr_unit: a.unit || null, city: g.city, zip: a.zip5, addr_norm: a.addrNorm,
    land_use_code: null, land_use_desc: null, is_single_family: null, is_condo: false, year_built: null, living_sqft: null,
    rooms: null, style: null, lot_acres: null, lot_sqft: null, garage_type: null, gas_service: null, water_source: null,
    sewer_type: null, market_value: null, assessed_value: null, owner_occupied_guess: null, last_sale_date: null,
    last_sale_price: null, foreclosure_flag: null, tax_delinquent: null, data_limited: true, source_updated_at: null,
    lon: g.lon, lat: g.lat,
  };
}

export async function runMedinaPermits(sql: Sql, o: { limit?: number; html?: string; full?: boolean } = {}) {
  return withJobRun(sql, { job: "ingest", source: medinaPermitsSource }, async (ctx) => {
    const html = o.html ?? (await (await politeFetch(MEDINA_PERMITS_URL, { timeoutMs: 180_000 })).text());
    let permits = parseMedinaList(html);
    if (o.limit) permits = permits.slice(0, o.limit);
    ctx.rowsIn = permits.length;
    ctx.meta.range = html.match(/From \d{2}\/\d{2}\/\d{2} through \d{2}\/\d{2}\/\d{2}/)?.[0] ?? null;
    // The list changes monthly; the daily run stops here until it does (--full forces a pass).
    if (!o.full && !o.limit && ctx.meta.range && ctx.meta.range === ctx.cursor.last_range) {
      ctx.meta.unchanged = true;
      return;
    }
    rawStore().put(medinaPermitsSource.code, "list", permits.map((p) => ({ ...p, contractor: business(p.contractor), electrical: business(p.electrical) })));

    // Stub parcels: one per home. A home is its PPN; a sub-permit whose building permit was in an
    // earlier month has no PPN, so it joins the stub already at that address in that town, or gets
    // an address-keyed stub. Stubs are geocoded until placed (placed ones keep their point).
    const addrOf = (p: MedinaPermit) => `${normalizeAddress(p.location ?? "").line}|${medinaTown(p.town) ?? ""}`;
    const withAddr = permits.filter((p) => p.location && normalizeAddress(p.location).houseNo);
    const ppnKeys = [...new Set(withAddr.map((p) => normalizeParcelId("medina", p.ppn)).filter(Boolean).map((x) => `medina:${x}`))];
    const known = await sql<{ parcel_key: string; addr_line: string; town: string | null; has_geom: boolean }[]>`
      select p.parcel_key, p.addr_line, m.name as town, p.geom is not null as has_geom from parcel p
      left join municipality m on m.id = p.municipality_id
      where p.county_code = 'medina' and (p.parcel_key = any(${ppnKeys})
        or p.addr_line = any(${[...new Set(withAddr.map((p) => normalizeAddress(p.location!).line))]}))`;
    const placed = new Map(known.map((r) => [r.parcel_key, r.has_geom]));
    const keyAt = new Map(known.map((r) => [`${r.addr_line}|${r.town ?? ""}`, r.parcel_key]));
    const keyFor = (p: MedinaPermit): string => {
      const ppn = normalizeParcelId("medina", p.ppn);
      if (ppn && placed.has(`medina:${ppn}`)) return `medina:${ppn}`;
      return keyAt.get(addrOf(p)) ?? (ppn ? `medina:${ppn}` : `medina:A${createHash("sha1").update(addrOf(p)).digest("hex").slice(0, 12).toUpperCase()}`);
    };
    const byKey = new Map<string, MedinaPermit>();
    const permitKey = new Map<MedinaPermit, string>();
    for (const p of withAddr) {
      const k = keyFor(p);
      permitKey.set(p, k);
      keyAt.set(addrOf(p), k);
      if (!byKey.has(k) || p.ppn) byKey.set(k, p);
    }
    const todo = [...byKey.keys()].filter((k) => !placed.get(k));
    const hits = await geocodeInCounty(
      todo.map((k) => ({ id: k, street: byKey.get(k)!.location!, city: medinaTown(byKey.get(k)!.town) ?? "MEDINA" })),
      MEDINA_POSTAL_CITIES, MEDINA_BBOX, MEDINA_TOWNSHIP_CITIES,
    );
    const towns = todo.map((k) => medinaTown(byKey.get(k)!.town) ?? "UNKNOWN");
    const muni = await municipalityIds(sql, "medina", towns);
    const stubs = todo.map((k, i) => {
      const p = byKey.get(k)!;
      const h = hits.get(k);
      return stubParcel(k, k.slice(7), p.location!, muni.get(towns[i]!) ?? null,
        { city: h?.city ?? towns[i]!, zip: h?.zip ?? "", lon: h?.lon ?? null, lat: h?.lat ?? null });
    });
    ctx.rowsUpserted += await upsertParcels(sql, stubs, { withGeom: true });
    ctx.meta.stubs_unplaced_before = stubs.length;
    ctx.meta.stubs_geocoded = hits.size;

    const events = permits.map((p) => medinaPermitEvent(p, permitKey.get(p) ?? null));
    const withParcel = events.filter((e) => e.parcel_key);
    ctx.meta.skipped_no_parcel = events.length - withParcel.length;
    const res = await writeEvents(sql, withParcel);
    ctx.rowsUpserted += res.upserted;

    if (!o.limit) ctx.cursor.last_range = ctx.meta.range;

    // Coverage: every town in the county list.
    const allTowns = [...new Set(permits.map((p) => medinaTown(p.town)).filter((t): t is string => !!t))];
    if (allTowns.length) {
      await municipalityIds(sql, "medina", allTowns);
      await sql`update municipality set permits_source = ${medinaPermitsSource.code}, data_tier = 'monthly_list',
        permits_since = coalesce((select extract(year from min(event_date))::int from parcel_event where source = ${medinaPermitsSource.code}), 2026)
        where county_code = 'medina' and name = any(${allTowns})`;
    }
  });
}
