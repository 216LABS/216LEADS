// M10 county adapters: parsing only (no network, no database). Row values are real public records;
// owner cells are replaced by a placeholder so no name is ever stored in a fixture (decision 31).
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { lakeMunicipality, lakePermitEvent, lakeReportLinks, parcelFromLake, parseLakeReport } from "./lake";
import { medinaPermitEvent, medinaTown, parseMedinaList } from "./medina";
import { parseStarkAddress, starkSaleEvent, starkStub } from "./stark";
import { parseCensusBatch } from "../geocode";

describe("Lake County", () => {
  it("normalizes town names across the parcel layer and the permit report", () => {
    expect(lakeMunicipality("Mentor-on-the-Lake City")).toBe(lakeMunicipality("Mentor on the Lake"));
    expect(lakeMunicipality("Painesville City")).toBe("PAINESVILLE");
    expect(lakeMunicipality("Painesville Township")).toBe("PAINESVILLE TOWNSHIP");
    expect(lakeMunicipality("Fairport Harbor Village")).toBe(lakeMunicipality("Fairport Harbor"));
    expect(lakeMunicipality("36")).toBeNull();
  });

  it("maps a parcel without owner fields and reads the owner-occupied guess", () => {
    const a = {
      PIN_NODASH: "27B057A000230", A_HOUSENO: "38577", A_ST_NAME: "BEACHVIEW", A_ST_TYPE: "RD", A_USPS_CITY: "WILLOUGHBY",
      A_ZIPCODE: "44094", A_ACRES: 0.2095, A_VAL_TOTAL: 193230, A_PROP_CLASS: 510, A_YEAR_BUILT: 1930,
      A_SALE_DATE: 1499212800000, A_SALE_AMOUNT: 105000, G_X_COORD_DD: -81.397, G_Y_COORD_DD: 41.7017,
      A_O_HOUSENO: "38565", A_O_ST_NAME: "BEACHVIEW", A_O_ZIPCODE: "44094",
    };
    const p = parcelFromLake(a, 7)!;
    expect(p.parcel_key).toBe("lake:27B057A000230");
    expect(p.addr_norm).toBe("38577 BEACHVIEW RD|44094");
    expect(p.land_use_code).toBe("510");
    expect(p.is_single_family).toBe(true);
    expect(p.last_sale_date).toBe("2017-07-05"); // midnight UTC, not shifted to the day before
    expect(p.owner_occupied_guess).toBe(false);
    expect(parcelFromLake({ ...a, A_O_HOUSENO: "38577" }, 7)!.owner_occupied_guess).toBe(true);
    expect(parcelFromLake({ ...a, A_SALE_DATE: Date.UTC(1900, 0, 1) }, 7)!.last_sale_date).toBeNull();
  });

  it("finds monthly report links oldest first", () => {
    const html = `<a href="https://wpassets.lakecountyohio.gov/wp-content/uploads/sites/10/2026/08/10083940/7-July-2026-Monthly-Report.xlsx">July</a>
      <a href="https://wpassets.lakecountyohio.gov/wp-content/uploads/sites/10/2025/01/30144742/12-December-Monthly-Report-2024.xlsx">Dec</a>
      <a href="https://wpassets.lakecountyohio.gov/wp-content/uploads/sites/10/2026/08/10083940/7-July-2026-Monthly-Report.xlsx">dup</a>`;
    const links = lakeReportLinks(html);
    expect(links).toHaveLength(2);
    expect(links[0]).toContain("2024.xlsx");
  });

  it("reads a report by header name whatever the column order, skipping section labels", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("1995exp");
    // 2022 layout: section label rows and a different column order than 2026.
    ws.addRow(["Permit #", "Permit Type", "Proposed Use", "Issued Date", "Applicant Name", "Site Address", "Municipality",
      "Job Description", "Const. Type", "Project Cost", "Square Feet", "Parcel #", "Lot", "Use Code", "DBA_NAME", "DBA_PHONE"]);
    ws.addRow([]);
    ws.addRow([null, null, null, "RESIDENTIAL"]);
    ws.addRow([2026002735, "HEATING/AIR CONDITIONING", "R-3", new Date("2026-07-09T00:00:00Z"), "APPLICANT CELL", "8140 AUBURN RD",
      "Concord Township", "FURNACE REPLACEMENT", "VB", 9800, 0, "08-A-021-0-00-040-0", 0, "Residential", "OWNER", "   -   -    "]);
    ws.addRow([2026002736, "BUILDING", "R-3", new Date("2026-07-10T00:00:00Z"), "APPLICANT CELL", "7590 AUBURN RD",
      "Concord Township", "TEAR OFF AND REROOF", "VB", 14000, 0, null, 0, "Residential", "DRAKE CONSTRUCTION COMPANY", "216-664-6500"]);
    const rows = await parseLakeReport(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ permit: "2026002735", issued: "2026-07-09", type: "HEATING/AIR CONDITIONING", use: "Residential", cost: 9800 });
    expect(JSON.stringify(rows)).not.toContain("APPLICANT CELL");

    const hvac = lakePermitEvent(rows[0]!, "https://example/report.xlsx")!;
    expect(hvac.category).toBe("hvac");
    expect(hvac.raw_type).toBe("HEATING/AIR CONDITIONING / Residential");
    expect(hvac.contractor).toBeNull(); // "OWNER" is not a contractor
    expect(hvac.match).toMatchObject({ county: "lake", parcelId: "08-A-021-0-00-040-0" });
    const roof = lakePermitEvent(rows[1]!, "https://example/report.xlsx")!;
    expect(roof.contractor).toMatchObject({ name: "DRAKE CONSTRUCTION COMPANY", phone: "216-664-6500" });
    expect(roof.match?.parcelId).toBeNull();
  });
});

const MEDINA_ROW = (permit: string, date: string, value: string, ppn: string, type: string, loc: string, town: string, contractor: string, elec: string) => `
  <tr>
    <td valign="top"><p>${date}<br>${value}</p></td>
    <td valign="top"><p>${permit}<br>${ppn}</p></td>
    <td valign="top"><p>${type}<br>${loc}<br>${town}</p></td>
    <td valign="top"><table cellpadding="0" cellspacing="0"><tr><td><p>OWNER CELL</p></td></tr><tr><td><p>OWNER ADDRESS CELL</p></td></tr></table></td>
    <td valign="top">${contractor ? `<table><tr><td><p>${contractor}</p></td></tr><tr><td><p>4305 MT PLEASANT ST NW</p></td></tr></table>` : ""}</td>
    <td valign="top">${elec ? `<table><tr><td><p>${elec}</p></td></tr></table>` : "<p>NONE SPECIFIED</p>"}</td>
  </tr>`;

describe("Medina County", () => {
  const html = `<table><tr><td colspan="6">From 10/01/26 through 10/31/26</td></tr>
    <tr><td colspan="6"><b><u>Building Permits:</u> 2</b></td></tr>
    ${MEDINA_ROW("R-02232-26", "10/01/26", "$171,862.00", "01221A10073", "REMODEL OR ALTERATION", "223&nbsp;WATER ST", "SEVILLE VILLAGE", "DESIGN RESTORATION", "THOMPSON ELECTRIC, INC.")}
    ${MEDINA_ROW("R-02233-26", "10/01/26", "$240,250.00", "03312B29020", "REMODEL OR ALTERATION", "446&nbsp;BRENTWOOD WAY", "SHARON", "OLD WORLD CLASSICS, LLC", "")}
    <tr><td colspan="6"><b><u>Electrical Permits:</u> 1</b></td></tr>
    ${MEDINA_ROW("R-02232-26", "10/20/26", "", "", "ELECTRIC", "223&nbsp;WATER ST", "SEVILLE VILLAGE", "", "PLACEHOLDER, PERSON A")}
    <tr><td colspan="6"><b><u>HVAC Permits:</u> 1</b></td></tr>
    ${MEDINA_ROW("R-02301-26", "10/03/26", "$9,400.00", "01314A17023", "FURNACE & AC REPLACEMENT", "9388&nbsp;KENNARD RD", "HARRISVILLE", "", "")}
    ${MEDINA_ROW("R-02301-26", "10/03/26", "$9,400.00", "01314A17023", "FURNACE & AC REPLACEMENT", "9388&nbsp;KENNARD RD", "HARRISVILLE", "", "")}
  </table>`;

  it("splits paired cells, tracks sections, dedupes, and never reads the owner cell", () => {
    const rows = parseMedinaList(html);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      section: "BUILDING", issued: "2026-10-01", value: 171862, permit: "R-02232-26", ppn: "01221A10073",
      projectType: "REMODEL OR ALTERATION", location: "223 WATER ST", town: "SEVILLE VILLAGE",
      contractor: "DESIGN RESTORATION", electrical: "THOMPSON ELECTRIC, INC.",
    });
    expect(rows[1]!.electrical).toBeNull();
    // The electrical sub-permit shares the building permit's number and gets its PPN.
    expect(rows[2]).toMatchObject({ section: "ELECTRICAL", permit: "R-02232-26", ppn: "01221A10073", value: null });
    expect(rows[3]).toMatchObject({ section: "HVAC", contractor: null });
    expect(JSON.stringify(rows)).not.toMatch(/OWNER (ADDRESS )?CELL/);
  });

  it("builds permit events on the stub parcel", () => {
    const [b, , el, h] = parseMedinaList(html);
    const e = medinaPermitEvent(b!, "medina:01221A10073");
    expect(e).toMatchObject({ source: "medina_permits", raw_type: "BUILDING / REMODEL OR ALTERATION", amount: 171862, category: "remodel" });
    expect(e.description).toContain("Electrical: THOMPSON ELECTRIC, INC.");
    expect(medinaPermitEvent(h!, "medina:01314A17023").category).toBe("hvac");
    const sub = medinaPermitEvent(el!, "medina:01221A10073");
    expect(sub.source_record_id).toBe("R-02232-26:ELECTRICAL");
    expect(sub.category).toBe("electrical");
    expect(JSON.stringify(sub)).not.toContain("PLACEHOLDER"); // a person's name never reaches stored text
    expect(medinaTown("SEVILLE VILLAGE")).toBe("SEVILLE");
  });
});

describe("Stark County", () => {
  it("splits the one-line site address", () => {
    expect(parseStarkAddress(" 761 ELM RIDGE AVE CANAL FULTON OH 44614 9380")).toEqual({ line: "761 ELM RIDGE AVE", city: "CANAL FULTON", zip: "44614" });
    expect(parseStarkAddress(" 7410 MARKET AVE N NORTH CANTON OH 44721 ")).toEqual({ line: "7410 MARKET AVE N", city: "NORTH CANTON", zip: "44721" });
    expect(parseStarkAddress(" 1088 APPLEGROVE ST NE CANTON OH 44721 2001")?.line).toBe("1088 APPLEGROVE ST NE");
    expect(parseStarkAddress("")).toBeNull();
  });

  const feature = (over: Record<string, unknown> = {}) => ({
    attributes: {
      PARID: "10000183", SITE_ADDRESS: " 1088 APPLEGROVE ST NE CANTON OH 44721 2001", TRANSFER_DATE: 1792468800000,
      SALE_PRICE: 140000, ARMS_LENGTH: "Yes", SALE_TYPE: "2+LAND & BUILDING", CONVEYANCE_NUMBER: "202612151",
      INSTR_TYPE_DESC: "WD-General Warranty Deed", ...over,
    },
    geometry: { rings: [[[-81.3756, 40.7686], [-81.3746, 40.7686], [-81.3746, 40.7696], [-81.3756, 40.7696], [-81.3756, 40.7686]]] },
  });

  it("creates limited-data stubs only for numbered land-and-building sales", () => {
    const s = starkStub(feature())!;
    expect(s).toMatchObject({ parcel_key: "stark:10000183", zip: "44721", data_limited: true, land_use_code: null, last_sale_date: "2026-10-20" });
    expect(s.lon).toBeCloseTo(-81.3751, 3);
    expect(starkStub(feature({ SALE_TYPE: "1+LAND" }))).toBeNull();
    expect(starkStub(feature({ SITE_ADDRESS: " MILL ST SE CANTON OH 44707 " }))).toBeNull();
  });

  it("keys sales per parcel and conveyance; arms-length needs Yes and $10K+", () => {
    const e = starkSaleEvent(feature().attributes, "stark:10000183")!;
    expect(e).toMatchObject({ source_record_id: "10000183:202612151", event_date: "2026-10-20", arms_length: true, kind: "sale" });
    expect(starkSaleEvent(feature({ ARMS_LENGTH: "No" }).attributes, "k")!.arms_length).toBe(false);
    expect(starkSaleEvent(feature({ SALE_PRICE: 5000 }).attributes, "k")!.arms_length).toBe(false);
    expect(JSON.stringify(e)).not.toMatch(/OWNER/);
  });
});

describe("Census batch geocoder", () => {
  it("parses matches and ignores misses", () => {
    const text = `"a3","446 BRENTWOOD WAY, WADSWORTH, OH, ","Match","Exact","446 BRENTWOOD WAY, WADSWORTH, OH, 44281","-81.707075764135,41.110385115579","613718121","R"
"a1","446 BRENTWOOD WAY, SHARON, OH, ","No_Match"`;
    const m = parseCensusBatch(text);
    expect(m.size).toBe(1);
    expect(m.get("a3")).toEqual({ lon: -81.707075764135, lat: 41.110385115579, city: "WADSWORTH", zip: "44281" });
  });
});
