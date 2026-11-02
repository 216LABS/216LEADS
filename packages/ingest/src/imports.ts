// Records-request importer (spec 5.12): permit lists cities send in reply to ORC 149.43 requests.
// The admin maps columns once per city; only mapped columns are ever read, and a column whose
// header names an owner, applicant or taxpayer can't be mapped, so owner data never gets in.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import type { Sql } from "@216leads/db";
import { normalizeAddress, zip5 } from "@216leads/shared";
import { categorize } from "@216leads/scoring";
import { writeEvents, type EventInput } from "./events";
import { municipalityIds } from "./parcels";
import { withJobRun } from "./runtime";

export const IMPORT_FIELDS = ["address", "zip", "parcel", "date", "type", "description", "value", "contractor", "id"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ImportMapping = Partial<Record<ImportField, string>>;

/** Headers that hold a person tied to the home. Never mappable. */
export const OWNER_HEADER = /owner|applicant|taxpayer|homeowner|occupant|tenant|resident|buyer|seller|grantee|grantor/i;

export interface Table {
  headers: string[];
  rows: string[][];
}

/** RFC 4180-ish CSV: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text: string): Table {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) out.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) out.push(row);
  const [headers = [], ...rows] = out;
  return { headers: headers.map((h) => h.trim()), rows: rows.map((r) => r.map((x) => x.trim())) };
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    return "";
  }
  return String(v).trim();
}

export async function parseXlsx(buf: Buffer): Promise<Table> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const all: string[][] = [];
  ws.eachRow((r) => {
    const vals = (r.values as ExcelJS.CellValue[]).slice(1).map(cellText);
    if (vals.some((x) => x)) all.push(vals);
  });
  const [headers = [], ...rows] = all;
  return { headers, rows };
}

/** The script next to this package, or from the repo root when bundled into the web app. */
function pyScript(): string {
  const candidates = [
    process.env.PDF_TABLES_SCRIPT,
    (() => { try { return fileURLToPath(new URL("../py/pdf_tables.py", import.meta.url)); } catch { return undefined; } })(),
    join(process.cwd(), "packages", "ingest", "py", "pdf_tables.py"),
    join(process.cwd(), "..", "..", "packages", "ingest", "py", "pdf_tables.py"),
  ];
  return candidates.find((c): c is string => !!c && existsSync(c)) ?? "pdf_tables.py";
}

/** PDF tables via pdfplumber (spec 5.12). Needs Python with pdfplumber; says so when missing. */
export async function parsePdf(buf: Buffer): Promise<Table> {
  const dir = mkdtempSync(join(tmpdir(), "rr-"));
  const file = join(dir, "in.pdf");
  writeFileSync(file, buf);
  try {
    const csv = await new Promise<string>((resolve, reject) => {
      execFile(process.env.PYTHON ?? "python", ["-E", "-P", pyScript(), file], { maxBuffer: 50 * 1024 * 1024, timeout: 120_000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(/pdfplumber|No module|not found|ENOENT/i.test(`${stderr} ${err.message}`)
          ? "PDF import needs Python with pdfplumber (pip install pdfplumber). Convert the PDF to CSV, or run the import where Python is available."
          : `PDF read failed: ${stderr.trim() || err.message}`));
        else resolve(stdout);
      });
    });
    return parseCsv(csv);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function parseUpload(name: string, buf: Buffer): Promise<Table> {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "csv" || ext === "txt") return parseCsv(buf.toString("utf8"));
  if (ext === "xlsx") return parseXlsx(buf);
  if (ext === "pdf") return parsePdf(buf);
  throw new Error("Upload a .csv, .xlsx or .pdf file");
}

export function sourceCode(city: string): string {
  return `rr_${city.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

/** Problems with a mapping, or [] when it can be used. */
export function mappingErrors(m: ImportMapping, headers: string[]): string[] {
  const errs: string[] = [];
  for (const [field, col] of Object.entries(m)) {
    if (!col) continue;
    if (!headers.includes(col)) errs.push(`"${col}" is not a column in this file`);
    else if (OWNER_HEADER.test(col)) errs.push(`"${col}" looks like owner or applicant data and can't be imported (${field})`);
  }
  if (!m.date) errs.push("Map the date column");
  if (!m.address && !m.parcel) errs.push("Map the address or the parcel column");
  return errs;
}

export function parseDate(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!m) return null;
  const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  return `${y}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
}

const money = (s: string) => {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return s.trim() && Number.isFinite(n) ? Math.round(n) : null;
};

/** Mapped rows -> permit events. Only the mapped columns are read. */
export function importEvents(t: Table, m: ImportMapping, o: { county: string; city: string }): { events: EventInput[]; skippedNoDate: number } {
  const idx = Object.fromEntries(Object.entries(m).filter(([, c]) => c).map(([f, c]) => [f, t.headers.indexOf(c!)])) as Partial<Record<ImportField, number>>;
  const get = (r: string[], f: ImportField) => (idx[f] !== undefined && idx[f]! >= 0 ? (r[idx[f]!] ?? "").trim() : "");
  const source = sourceCode(o.city);
  const events: EventInput[] = [];
  let skippedNoDate = 0;
  for (const r of t.rows) {
    const date = parseDate(get(r, "date"));
    if (!date) { skippedNoDate++; continue; }
    const address = get(r, "address");
    const type = get(r, "type") || null;
    const description = get(r, "description") || null;
    const id = get(r, "id") || createHash("sha1").update([date, address, get(r, "parcel"), type, description].join("|")).digest("hex").slice(0, 16);
    const contractor = get(r, "contractor");
    events.push({
      source, source_record_id: id, kind: "permit", event_date: date, raw_type: type, description,
      category: categorize(type, description), amount: money(get(r, "value")),
      contractor: contractor ? { name: contractor, is_individual: false } : null,
      match: { county: o.county, parcelId: get(r, "parcel") || null, addrLine: address || null, zip: zip5(get(r, "zip")) || null },
      payload: { date, address, parcel: get(r, "parcel"), type, description },
    });
  }
  return { events, skippedNoDate };
}

/** Records without a ZIP take the ZIP of the one home at that street address in that town. */
async function fillZips(sql: Sql, county: string, town: string, events: EventInput[]) {
  const want = events.filter((e) => !e.match?.zip && e.match?.addrLine);
  if (!want.length) return;
  const lines = [...new Set(want.map((e) => normalizeAddress(e.match!.addrLine!).line))];
  const rows = await sql<{ line: string; zip: string }[]>`
    select split_part(p.addr_norm, '|', 1) as line, min(p.zip) as zip from parcel p
    join municipality m on m.id = p.municipality_id
    where p.county_code = ${county} and m.name = ${town} and split_part(p.addr_norm, '|', 1) = any(${lines})
    group by 1 having count(distinct p.zip) = 1`;
  const zip = new Map(rows.map((r) => [r.line, r.zip]));
  for (const e of want) {
    const z = zip.get(normalizeAddress(e.match!.addrLine!).line);
    if (z) e.match!.zip = z;
  }
}

export interface ImportResult {
  source: string;
  rows: number;
  upserted: number;
  matched: number;
  unmatched: number;
  skippedNoDate: number;
}

export async function runRecordsImport(sql: Sql, o: { county: string; city: string; table: Table; mapping: ImportMapping }): Promise<ImportResult> {
  const errs = mappingErrors(o.mapping, o.table.headers);
  if (errs.length) throw new Error(errs.join("; "));
  const town = o.city.trim().toUpperCase();
  const source = sourceCode(town);
  let out: ImportResult = { source, rows: 0, upserted: 0, matched: 0, unmatched: 0, skippedNoDate: 0 };
  await withJobRun(sql, { job: "ingest", source: { code: source, name: `Records request: ${town}`, url: "admin upload", schedule_cron: "manual" } }, async (ctx) => {
    const { events, skippedNoDate } = importEvents(o.table, o.mapping, { county: o.county, city: town });
    await fillZips(sql, o.county, town, events);
    let res = { upserted: 0, matched: 0, unmatched: 0 };
    for (let i = 0; i < events.length; i += 1000) {
      const r = await writeEvents(sql, events.slice(i, i + 1000));
      res = { upserted: res.upserted + r.upserted, matched: res.matched + r.matched, unmatched: res.unmatched + r.unmatched };
    }
    ctx.rowsIn = events.length;
    ctx.rowsUpserted = res.upserted;
    ctx.rowsUnmatched = res.unmatched;
    ctx.meta.skipped_no_date = skippedNoDate;
    await sql`insert into import_mapping (source, county_code, municipality, mapping) values (${source}, ${o.county}, ${town}, ${sql.json(o.mapping)})
      on conflict (source) do update set county_code = excluded.county_code, municipality = excluded.municipality, mapping = excluded.mapping, updated_at = now()`;
    await municipalityIds(sql, o.county, [town]);
    await sql`update municipality set permits_source = ${source}, data_tier = 'records_request',
      permits_since = (select extract(year from min(event_date))::int from parcel_event where source = ${source})
      where county_code = ${o.county} and name = ${town}`;
    out = { source, rows: events.length, ...res, skippedNoDate };
  });
  return out;
}

export async function savedMapping(sql: Sql, city: string): Promise<{ county_code: string; mapping: ImportMapping } | null> {
  const [r] = await sql<{ county_code: string; mapping: ImportMapping }[]>`
    select county_code, mapping from import_mapping where source = ${sourceCode(city.trim().toUpperCase())}`;
  return r ?? null;
}
