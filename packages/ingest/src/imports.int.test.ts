// Spec 5.12 records importer against the seeded DB. The sample is real: Cleveland permits from the
// fixtures, written out the way a city answers a records request (CSV, and a PDF table when Python
// with pdfplumber is available). An "Owner Name" column holds a placeholder and must never get in.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { closeAll, getDirectSql } from "@216leads/db";
import { mappingErrors, parseCsv, parseUpload, runRecordsImport, savedMapping, type ImportMapping } from "./imports";

const sql = getDirectSql();
const SOURCE = "rr_cleveland";
const HEADERS = ["Permit No", "Issued", "Site Address", "Owner Name", "Work Type", "Description", "Valuation", "Contractor"];
let rows: string[][] = [];
type Coverage = { permits_source: string | null; permits_since: number | null; data_tier: string };
let coverage: Coverage | undefined;

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const mapping: ImportMapping = { id: "Permit No", date: "Issued", address: "Site Address", type: "Work Type", description: "Description", value: "Valuation", contractor: "Contractor" };

const hasPdfplumber = (() => {
  try {
    execFileSync(process.env.PYTHON ?? "python", ["-c", "import pdfplumber"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

beforeAll(async () => {
  [coverage] = await sql<Coverage[]>`select permits_source, permits_since, data_tier from municipality where county_code = 'cuyahoga' and name = 'CLEVELAND'`;
  const ev = await sql<{ id: string; d: string; addr: string; raw_type: string | null; description: string | null; amount: number | null; contractor: string | null }[]>`
    select e.source_record_id as id, to_char(e.event_date, 'MM/DD/YYYY') as d, p.addr_line as addr, e.raw_type,
      left(e.description, 60) as description, e.amount, c.display_name as contractor
    from parcel_event e join parcel p on p.parcel_key = e.parcel_key left join contractor c on c.id = e.contractor_id and not c.is_individual
    where e.source = 'cle_permits' and p.addr_line ~ '^[0-9]+ ' order by e.id limit 20`;
  rows = ev.map((e) => [`RR-${e.id}`, e.d, e.addr, "OWNER PLACEHOLDER", e.raw_type ?? "", e.description ?? "", String(e.amount ?? ""), e.contractor ?? ""]);
});

afterAll(async () => {
  await sql`delete from parcel_event where source = ${SOURCE}`;
  await sql`delete from unmatched_record where source = ${SOURCE}`;
  await sql`delete from import_mapping where source = ${SOURCE}`;
  if (coverage) {
    await sql`update municipality set permits_source = ${coverage.permits_source}, permits_since = ${coverage.permits_since}, data_tier = ${coverage.data_tier}
      where county_code = 'cuyahoga' and name = 'CLEVELAND'`;
  }
  await closeAll();
});

describe("records-request importer (spec 5.12)", () => {
  it("refuses owner columns and incomplete mappings", () => {
    expect(mappingErrors({ ...mapping, contractor: "Owner Name" }, HEADERS).join()).toMatch(/owner/i);
    expect(mappingErrors({ address: "Site Address" }, HEADERS).join()).toMatch(/date/);
    expect(mappingErrors(mapping, HEADERS)).toEqual([]);
  });

  it("maps a CSV, matches by address without a ZIP, saves the mapping and marks coverage", async () => {
    expect(rows.length).toBeGreaterThan(5);
    const csv = [HEADERS, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const table = await parseUpload("cleveland-2026-10.csv", Buffer.from(csv));
    expect(table.headers).toEqual(HEADERS);
    const r = await runRecordsImport(sql, { county: "cuyahoga", city: "Cleveland", table, mapping });
    expect(r.rows).toBe(rows.length);
    expect(r.matched / r.rows).toBeGreaterThan(0.8);
    const stored = await sql<{ n: number; owner: number }[]>`
      select count(*)::int as n, count(*) filter (where description ilike '%PLACEHOLDER%' or raw_type ilike '%PLACEHOLDER%')::int as owner
      from parcel_event where source = ${SOURCE}`;
    expect(stored[0]).toEqual({ n: rows.length, owner: 0 });
    const raw = await sql<{ n: number }[]>`select count(*)::int as n from unmatched_record where source = ${SOURCE} and payload::text ilike '%PLACEHOLDER%'`;
    expect(raw[0]!.n).toBe(0);
    expect((await savedMapping(sql, "cleveland"))?.mapping).toEqual(mapping);
    const [m] = await sql<{ permits_source: string; data_tier: string }[]>`select permits_source, data_tier from municipality where county_code = 'cuyahoga' and name = 'CLEVELAND'`;
    expect(m).toEqual({ permits_source: SOURCE, data_tier: "records_request" });
    // Importing the same file again changes nothing.
    expect((await runRecordsImport(sql, { county: "cuyahoga", city: "Cleveland", table, mapping })).upserted).toBe(0);
  });

  it.skipIf(!hasPdfplumber)("reads the same list from a PDF table", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([1400, 60 + 22 * (rows.length + 1)]);
    const widths = [120, 90, 200, 150, 200, 360, 90, 180];
    const all = [HEADERS, ...rows];
    const top = page.getHeight() - 30;
    all.forEach((r, i) => {
      let x = 20;
      r.forEach((c, j) => {
        page.drawRectangle({ x, y: top - (i + 1) * 22, width: widths[j]!, height: 22, borderWidth: 0.5 });
        page.drawText(c.replace(/[^\x20-\x7E]/g, "").slice(0, 60), { x: x + 3, y: top - (i + 1) * 22 + 7, size: 8, font });
        x += widths[j]!;
      });
    });
    const t = await parseUpload("cleveland.pdf", Buffer.from(await doc.save()));
    expect(t.headers).toEqual(HEADERS);
    expect(t.rows.length).toBe(rows.length);
    expect(t.rows[0]![2]).toBe(rows[0]![2]);
  });

  it("parses quoted CSV cells", () => {
    expect(parseCsv('a,b\r\n"1, x","say ""hi"""\n').rows).toEqual([["1, x", 'say "hi"']]);
  });
});
