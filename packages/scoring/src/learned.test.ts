import { describe, expect, it } from "vitest";
import { effectiveProfile } from "./engine";
import { TEMPLATES } from "./generated";
import { learnWeights, MIN_OUTCOMES } from "./learned";
import type { ParcelFacts, ScoreInput } from "./types";

const input = (p: Partial<ParcelFacts>): ScoreInput => ({
  parcel: {
    parcel_key: "cuyahoga:00000001", addr_line: "1 TEST ST", city: "CLEVELAND", zip: "44111", land_use_code: "5100",
    year_built: 1925, living_sqft: 1400, lot_acres: 0.15, style: "COL", garage_type: "DETACHED", gas_service: true,
    water_source: "MUN", sewer_type: "SNS", market_value: 150000, last_sale_date: "2015-06-01", last_sale_price: 90000,
    owner_occupied_guess: true, is_rental: false, is_condo: false, tax_delinquent: false, canopy_pct: 30, grass_pct: 30,
    flood_zone: "X", in_sfha: false, survey_2022: null, ...p,
  },
  signals: {}, coverage: { permits: true, permits_since: 2015, violations: true },
  derived: { lot_pct: 0.5, living_pct: 0.5 }, recentEvents: [], today: "2026-11-01",
});

describe("learned weights (spec 7.6)", () => {
  const t = TEMPLATES.gutters!;
  const profile = effectiveProfile(t);

  it("does nothing before 10 outcomes", () => {
    const rows = Array.from({ length: MIN_OUTCOMES - 1 }, (_, i) => ({ input: input({ canopy_pct: 60 }), outcome: i % 2 ? "won" as const : "lost" as const }));
    expect(learnWeights(t, profile, rows).weights).toEqual({});
  });

  it("nudges canopy up when wins have more trees, clamped to 0.8-1.25", () => {
    const won = Array.from({ length: 6 }, () => ({ input: input({ canopy_pct: 60 }), outcome: "won" as const }));
    const lost = Array.from({ length: 6 }, () => ({ input: input({ canopy_pct: 0 }), outcome: "lost" as const }));
    const r = learnWeights(t, profile, [...won, ...lost]);
    expect(r.meta.canopy).toEqual({ won: 1, lost: 0, factor: 1.25 });
    expect(r.weights.canopy).toBe(1.25);
    // Same signal on both sides: no nudge recorded.
    expect(r.weights.age).toBeUndefined();
    const flipped = learnWeights(t, profile, [...won.map((w) => ({ ...w, outcome: "lost" as const })), ...lost.map((l) => ({ ...l, outcome: "won" as const }))]);
    expect(flipped.weights.canopy).toBe(0.8);
  });

  it("counts a skip as half a loss", () => {
    const won = Array.from({ length: 5 }, () => ({ input: input({ canopy_pct: 30 }), outcome: "won" as const }));
    const lost = Array.from({ length: 1 }, () => ({ input: input({ canopy_pct: 0 }), outcome: "lost" as const }));
    const skipped = Array.from({ length: 4 }, () => ({ input: input({ canopy_pct: 60 }), outcome: "skipped" as const }));
    // lost mean = (0*1 + 1*0.5*4) / (1 + 2) = 2/3; won = 0.5 -> 1 + 0.25 * (0.5 - 0.667) = 0.958
    expect(learnWeights(t, profile, [...won, ...lost, ...skipped]).meta.canopy!.factor).toBeCloseTo(0.958, 3);
  });
});
