// Summit County Building Standards permit search (5.11, best effort). Permit numbers are sequential
// (BP26#####); walk forward from the last one seen at 1 request / 2 s and stop after 50 misses in a
// row. Each page also shows owner and applicant blocks: only the permit details and the contractor
// block are ever cut out of the page, so those names are never read.
import type { Sql } from "@216leads/db";
import { looksLikeIndividual, normalizeAddress, todayEt } from "@216leads/shared";
import { categorize } from "@216leads/scoring";
import { politeFetch } from "../http";
import { rawStore } from "../rawstore";
import { withJobRun, type SourceDef } from "../runtime";
import { writeEvents, type EventInput } from "../events";
import { normalizeParcelId } from "../match";
import { municipalityIds, upsertParcels, type ParcelRow } from "../parcels";
import { geocodeInCounty } from "../geocode";

export const SUMMIT_PERMIT_URL = "https://permitsearch.summitoh.net/PermitResult?PermitNumber=";
export const SUMMIT_BBOX = { minLon: -81.69, minLat: 40.9, maxLon: -81.39, maxLat: 41.35 };
const MAX_MISSES = 50;

export const summitPermitsSource: SourceDef = {
  code: "summit_permits",
  name: "Summit County building permits (permit search, best effort)",
  url: SUMMIT_PERMIT_URL,
  schedule_cron: "0 4 * * *",
  notes: "Sequential BP{yy}##### numbers; stops after 50 misses. Summit moved to GovWell around 2026-09-25, so this may stop updating.",
};

export interface SummitPermit {
  permit: string;
  address: string | null;
  city: string | null;
  zip: string | null;
  parcel: string | null;
  type: string | null;
  category: string | null;
  issued: string | null;
  description: string | null;
  status: string | null;
  contractor: string | null;
}

const flat = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#x?[0-9a-f]+;/gi, " ").replace(/[ \t]+/g, " ");

/** Text between two headings, or "". */
const section = (t: string, from: string, to: string) => {
  const a = t.indexOf(from);
  if (a < 0) return "";
  const b = t.indexOf(to, a + from.length);
  return t.slice(a + from.length, b < 0 ? undefined : b);
};

/** "Label: value" on one line; a blank value may sit on the next line ("Parcel:" then "6723707"), unless that line is another label. */
const field = (block: string, label: string): string | null => {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  const i = lines.findIndex((l) => l.startsWith(`${label}:`));
  if (i < 0) return null;
  const v = lines[i]!.slice(label.length + 1).trim();
  if (v) return v;
  const next = lines[i + 1];
  return next && !/^[A-Za-z][A-Za-z .&#]*:/.test(next) ? next : null;
};

function usDate(s: string | null): string | null {
  const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

/** Parse one permit page; null when the number doesn't exist. Owner/applicant blocks are not read. */
export function parseSummitPermit(html: string): SummitPermit | null {
  const t = flat(html);
  const details = section(t, "Permit Details", "Inspections");
  const contractor = section(t, "Contractor Information", "Applicant Information");
  const permit = field(details, "Number") ?? field(details, "Permit");
  if (!permit) return null;
  // "369 SANDHURST RD, AKRON 44333"
  const addr = field(details, "Address");
  const am = addr?.match(/^(.*?),\s*(.*?)\s+(\d{5})(?:-\d{4})?$/);
  return {
    permit,
    address: am ? am[1]!.trim() : addr,
    city: am ? am[2]!.trim().toUpperCase() : null,
    zip: am ? am[3]! : null,
    parcel: field(details, "Parcel"),
    type: field(details, "Type"),
    category: field(details, "Category"),
    issued: usDate(field(details, "Issue Date")),
    description: field(details, "Work Description"),
    status: field(details, "Status"),
    contractor: field(contractor, "Name"),
  };
}

export function summitEvent(p: SummitPermit, parcelKey: string): EventInput | null {
  if (!p.issued) return null;
  const rawType = [p.type, p.category].filter(Boolean).join(" / ") || null;
  return {
    source: summitPermitsSource.code, source_record_id: p.permit, kind: "permit", event_date: p.issued,
    raw_type: rawType, description: p.description, category: categorize(rawType, p.description), status: p.status,
    contractor: p.contractor ? { name: p.contractor, is_individual: false } : null,
    source_url: `${SUMMIT_PERMIT_URL}${p.permit}`, parcel_key: parcelKey,
  };
}

function stub(p: SummitPermit, key: string, muniId: number | null, g: { lon: number; lat: number } | undefined): ParcelRow {
  const a = normalizeAddress(p.address ?? "", p.zip);
  return {
    parcel_key: key, county_code: "summit", parcel_id: key.slice(7), municipality_id: muniId, addr_line: a.line, addr_unit: a.unit || null,
    city: p.city ?? "", zip: a.zip5, addr_norm: a.addrNorm, land_use_code: null, land_use_desc: null, is_single_family: null,
    is_condo: false, year_built: null, living_sqft: null, rooms: null, style: null, lot_acres: null, lot_sqft: null, garage_type: null,
    gas_service: null, water_source: null, sewer_type: null, market_value: null, assessed_value: null, owner_occupied_guess: null,
    last_sale_date: null, last_sale_price: null, foreclosure_flag: null, tax_delinquent: null, data_limited: true, source_updated_at: null,
    lon: g?.lon ?? null, lat: g?.lat ?? null,
  };
}

async function writeBatch(sql: Sql, batch: SummitPermit[]) {
  const homes = batch.filter((p) => normalizeParcelId("summit", p.parcel) && p.address && p.issued);
  const keys = [...new Set(homes.map((p) => `summit:${normalizeParcelId("summit", p.parcel)}`))];
  const placed = new Set((await sql<{ parcel_key: string }[]>`
    select parcel_key from parcel where parcel_key = any(${keys}) and geom is not null`).map((r) => r.parcel_key));
  const byKey = new Map(homes.map((p) => [`summit:${normalizeParcelId("summit", p.parcel)}`, p]));
  const todo = keys.filter((k) => !placed.has(k));
  const hits = await geocodeInCounty(todo.map((k) => ({ id: k, street: byKey.get(k)!.address!, city: byKey.get(k)!.city ?? "", zip: byKey.get(k)!.zip ?? "" })), [], SUMMIT_BBOX);
  const muni = await municipalityIds(sql, "summit", todo.map((k) => byKey.get(k)!.city ?? "UNKNOWN"));
  await upsertParcels(sql, todo.map((k) => stub(byKey.get(k)!, k, muni.get(byKey.get(k)!.city ?? "UNKNOWN") ?? null, hits.get(k))), { withGeom: true });
  const events = homes.map((p) => summitEvent(p, `summit:${normalizeParcelId("summit", p.parcel)}`)).filter((e): e is EventInput => e !== null);
  return writeEvents(sql, events);
}

export async function runSummitPermits(sql: Sql, o: { limit?: number; full?: boolean } = {}) {
  return withJobRun(sql, { job: "ingest", source: summitPermitsSource }, async (ctx) => {
    const yy = todayEt().slice(2, 4);
    let next = !o.full && ctx.cursor.year === yy ? Number(ctx.cursor.last ?? 0) + 1 : 1;
    let misses = 0;
    let fetched = 0;
    let batch: SummitPermit[] = [];
    const flush = async () => {
      if (!batch.length) return;
      const r = await writeBatch(sql, batch);
      ctx.rowsUpserted += r.upserted;
      rawStore().put(summitPermitsSource.code, batch[0]!.permit,
        batch.map((p) => ({ ...p, contractor: p.contractor && !looksLikeIndividual(p.contractor) ? p.contractor : null })));
      batch = [];
    };
    while (misses < MAX_MISSES && (!o.limit || fetched < o.limit)) {
      const num = `BP${yy}${String(next).padStart(5, "0")}`;
      const html = await (await politeFetch(`${SUMMIT_PERMIT_URL}${num}`, { minIntervalMs: 2000 })).text();
      fetched++;
      const p = parseSummitPermit(html);
      if (!p) misses++;
      else {
        misses = 0;
        ctx.cursor.year = yy;
        ctx.cursor.last = next;
        ctx.rowsIn++;
        batch.push(p);
        if (batch.length >= 50) await flush();
      }
      if (fetched % 200 === 0) ctx.log(`${num}: ${ctx.rowsIn} permits`);
      next++;
    }
    await flush();
    ctx.meta.fetched = fetched;
    ctx.meta.last_number = ctx.cursor.last ?? null;
  });
}
