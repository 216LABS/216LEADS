// Issue #11: point-of-sale inspection city trigger (`pos_city_sale`).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { effectiveProfile, scoreParcel } from "./engine";
import { POS_CITIES, POS_SOURCE, TEMPLATES } from "./generated";
import { isKnownSignal } from "./recipe";
import { posCity, resolveSignal } from "./signals";
import type { ParcelFacts, ScoreInput } from "./types";

const today = "2026-11-02";
const daysAgo = (n: number) => new Date(Date.parse(`${today}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

const input = (municipality: string, saleDaysAgo: number | null, price = 180_000): ScoreInput => ({
  parcel: {
    parcel_key: "cuyahoga:00000001", addr_line: "1 TEST ST", city: "EUCLID", zip: "44117", land_use_code: "5100", year_built: 1955,
    living_sqft: 1300, lot_acres: 0.15, style: "RANCH", garage_type: "ATTACHED", gas_service: true, water_source: "MUN", sewer_type: "SNS",
    market_value: 150_000, last_sale_date: saleDaysAgo === null ? null : daysAgo(saleDaysAgo), last_sale_price: saleDaysAgo === null ? null : price,
    owner_occupied_guess: true, is_rental: false, is_condo: false, tax_delinquent: false, canopy_pct: 25, grass_pct: 30,
    flood_zone: "X", in_sfha: false, survey_2022: null,
  } as ParcelFacts,
  signals: {}, coverage: { permits: true, permits_since: 2015, violations: false },
  derived: { lot_pct: 0.5, living_pct: 0.5 }, recentEvents: [], municipality, today,
});

const roofing = TEMPLATES.roofing!;
const sig = (i: ScoreInput) => resolveSignal("pos_city_sale", { weight: 5 }, i, effectiveProfile(roofing));

describe("pos_city_sale (issue #11)", () => {
  it("a sale 30 days ago in Euclid fires with the reason sentence", () => {
    const r = sig(input("EUCLID", 30))!;
    expect(r.v).toBe(1);
    expect(r.label).toBe("Sold in Euclid, which requires a point-of-sale inspection");
  });

  it("a sale 120 days ago does not fire", () => {
    expect(sig(input("EUCLID", 120))!.v).toBe(0);
    expect(sig(input("EUCLID", null))!.v).toBe(0);
    expect(sig(input("EUCLID", 10, 0))!.v).toBe(0); // $0 family transfer is not a sale (decision 20)
  });

  it("a sale in Lakewood (not on the list) does not fire, and leaves the signal out", () => {
    expect(sig(input("LAKEWOOD", 10))).toBeNull();
    expect(posCity("LAKEWOOD")).toBeNull();
    expect(posCity("shaker heights")?.name).toBe("Shaker Heights");
  });

  it("raises a recent POS-city sale above the same home elsewhere, and doesn't change homes outside POS towns", () => {
    const p = effectiveProfile(roofing);
    const inEuclid = scoreParcel(roofing, p, input("EUCLID", 20));
    const inLakewood = scoreParcel(roofing, p, input("LAKEWOOD", 20));
    expect(inEuclid.score).toBeGreaterThan(inLakewood.score);
    expect(inEuclid.reasons.map((r) => r.label)).toContain("Sold in Euclid, which requires a point-of-sale inspection");
    const without = { ...roofing, signals: Object.fromEntries(Object.entries(roofing.signals).filter(([k]) => k !== "pos_city_sale")) };
    expect(scoreParcel(without, effectiveProfile(without), input("LAKEWOOD", 20)).score).toBe(inLakewood.score);
  });

  it("can be switched off like any signal (wizard slider at 0) and is allowed in recipes", () => {
    const off = effectiveProfile(roofing, { weights: { pos_city_sale: 0 } });
    expect(scoreParcel(roofing, off, input("EUCLID", 20)).reasons.map((r) => r.label).join()).not.toContain("point-of-sale");
    expect(isKnownSignal("pos_city_sale")).toBe(true);
  });

  it("is in roofing, plumbing, electrical, gutters and concrete at weight 5 from YAML; never HVAC", () => {
    for (const k of ["roofing", "plumbing", "electrical", "gutters", "concrete"]) expect(TEMPLATES[k]!.signals.pos_city_sale?.weight).toBe(5);
    expect(TEMPLATES.hvac!.signals.pos_city_sale).toBeUndefined();
  });

  it("lists the 25 ACAR cities, each resolving to a town in our parcel data", () => {
    expect(POS_SOURCE).toMatch(/ACAR/);
    expect(POS_CITIES).toHaveLength(25);
    const known = JSON.parse(readFileSync(new URL("./__fixtures__/municipalities.json", import.meta.url), "utf8")) as {
      municipalities: { county: string; name: string; parcels: number }[];
    };
    const names = new Set(known.municipalities.filter((m) => m.parcels > 0).map((m) => `${m.county}|${m.name}`));
    for (const c of POS_CITIES) {
      if (c.in_data === false) {
        // Twinsburg and Macedonia run their own building departments, so Summit's permit list doesn't reach them.
        expect(c.county).toBe("summit");
        continue;
      }
      expect(names.has(`${c.county}|${c.municipality}`), `${c.name} -> ${c.municipality}`).toBe(true);
    }
  });
});
