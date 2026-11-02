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
