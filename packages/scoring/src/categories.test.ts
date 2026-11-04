import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { categorize } from "./categories";
import { buildGenerated } from "../scripts/gen";

interface Row {
  sampled_as: string;
  raw_type: string;
  description: string;
  /** Human label from review of each real permit (null = no category fits). */
  expected: string | null;
}

// Real City of Cleveland building permits (Building_Permits layer), up to 50 per category,
// sampled by tools/sample-categories.ts and hand-labeled.
const rows = JSON.parse(readFileSync(new URL("./__fixtures__/categories.cle.json", import.meta.url), "utf8")) as Row[];

describe("category regex (spec 7.3) on real Cleveland permits", () => {
  const byCat = new Map<string, Row[]>();
  for (const r of rows) byCat.set(r.sampled_as, [...(byCat.get(r.sampled_as) ?? []), r]);

  it("has a real sample for every category the presets rely on", () => {
    for (const c of ["roofing", "hvac", "plumbing", "electrical", "siding", "windows", "gutters", "painting", "remodel", "waterproof", "pool", "garage", "new_build", "demolition", "fence_deck"]) {
      expect(byCat.get(c)?.length ?? 0, c).toBeGreaterThanOrEqual(20);
    }
  });

  for (const [cat, list] of byCat) {
    if (list.length < 20) continue; // low-confidence categories are flagged in the UI instead
    it(`${cat}: at least 90% correct (${list.length} real permits)`, () => {
      const correct = list.filter((r) => categorize(r.raw_type, r.description) === r.expected).length;
      expect(correct / list.length).toBeGreaterThanOrEqual(0.9);
    });
  }
});

// Real Lake County residential permits (monthly permit XLSX, April-July 2026), raw_type
// "Permit Type / Use Code", up to 50 per predicted category, hand-labeled. Lake publishes
// few permit kinds, so only some categories reach 20 rows.
const lake = JSON.parse(readFileSync(new URL("./__fixtures__/categories.lake.json", import.meta.url), "utf8")) as Row[];

describe("category regex (spec 7.3) on real Lake County permits", () => {
  const byCat = new Map<string, Row[]>();
  for (const r of lake) byCat.set(r.sampled_as, [...(byCat.get(r.sampled_as) ?? []), r]);

  it("has a real sample for the categories Lake actually publishes", () => {
    for (const c of ["hvac", "electrical", "plumbing", "new_build", "fence_deck", "garage", "remodel", "waterproof"]) {
      expect(byCat.get(c)?.length ?? 0, c).toBeGreaterThanOrEqual(20);
    }
  });

  for (const [cat, list] of byCat) {
    if (list.length < 20) continue;
    it(`${cat}: at least 90% correct (${list.length} real permits)`, () => {
      const correct = list.filter((r) => categorize(r.raw_type, r.description) === r.expected).length;
      expect(correct / list.length).toBeGreaterThanOrEqual(0.9);
    });
  }

  it("doesn't read the violation form's \"boiler plate\" text as HVAC", () => {
    const form = "Use this guidesheet for violations not contained in the boiler plate guide sheets.  Enter ordinance number within brackets followed by violation description.";
    expect(categorize("Lead Violation", `${form} [365.04] (b) FAILURE TO GET A LEAD SAFE CERTIFICATE PER 365.4`)).not.toBe("hvac");
    expect(categorize("Interior Maintenance", `${form} [369.12]: Needs a heat certification. Gas valve inoperable. The furnace is not maintained.`)).toBe("hvac");
    expect(categorize(null, "The boiler is leaking and does not heat the dwelling")).toBe("hvac");
  });

  it("lets the permit type decide when the description names the whole project", () => {
    expect(categorize("HEATING/AIR CONDITIONING / Residential", "NEW DWELLING W/ATTACHED GARAGE")).toBe("hvac");
    expect(categorize("FUEL GAS PIPING PERMIT / Residential", "GENERATOR")).toBe("plumbing");
    expect(categorize("BUILDING / Residential", "NEW DWELLING W/ATTACHED GARAGE")).toBe("new_build");
    expect(categorize("BUILDING / Residential", "GARAGE DEMO")).toBe("demolition");
    expect(categorize("BUILDING / Residential", "PATIO ROOF")).toBe("fence_deck");
  });
});

describe("category edge cases", () => {
  const c = (raw: string, d: string) => categorize(raw, d);
  it("uses the city's own category prefix", () => {
    expect(c("HVAC and Refrigeration / Construction Project", "1 ROOFTOP HTG/COOLING UNIT")).toBe("hvac");
    expect(c("Residential Electrical / x", "Rooftop solar array")).toBe("electrical");
  });
  it("ignores work named in 'separate permits required' clauses", () => {
    expect(c("New", "ERECT 20' X 20' 1 STORY FRAME DETACHED GARAGE. SEPARATE PERMIT REQ'D. FOR ELECTRICAL AND APRON.")).toBe("garage");
  });
  it("matches plural and -ing forms the spec's \\b rejected", () => {
    expect(c("New", "MAKE EXT ALT TEAR OFF AND REROOF")).toBe("roofing");
    expect(c("New", "REPLACE 12 WINDOWS")).toBe("windows");
  });
  it("keeps non-trade permits out of trade categories", () => {
    expect(c("Board-ups / x", "BOARD 1 GARAGE DOOR")).toBe("boardup");
    expect(c("New", "INSTALL 240 SF PAINTED BUSINESS WALL SIGN")).toBe("signage");
    expect(c("New", "REPLACE SIGN FACES FOR DOLLAR TREE POLE SIGN")).toBe("signage");
  });
});

describe("generated templates", () => {
  it("src/generated.ts matches templates/*.yaml (run `pnpm --filter @216leads/scoring gen`)", () => {
    const onDisk = readFileSync(new URL("./generated.ts", import.meta.url), "utf8");
    expect(onDisk.replace(/\r\n/g, "\n")).toBe(buildGenerated());
  });
});
