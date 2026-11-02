// Spec 15 determinism snapshot: 20 homes scored by several presets. A change in any score,
// reason, pitch or trigger shows up as a snapshot diff (update deliberately with `vitest -u`).
import { describe, expect, it } from "vitest";
import { effectiveProfile, passesFilters, scoreParcel } from "./engine";
import { TEMPLATES } from "./generated";
import type { MaterializedSignal, ParcelFacts, RecentEvent, ScoreInput } from "./types";

const today = "2026-11-01";
const CATS = ["roofing", "hvac", "plumbing", "electrical", "siding", "pool", "new_build", "remodel"];
const SURVEY = ["Good", "Fair", "Poor"];

/** Home i of 20: every attribute varies on its own cycle so the set covers many combinations. */
function home(i: number): ScoreInput {
  const parcel: ParcelFacts = {
    parcel_key: `cuyahoga:snap${String(i).padStart(4, "0")}`, addr_line: `${100 + i * 7} SNAPSHOT AVE`,
    city: i % 3 ? "CLEVELAND" : "LAKEWOOD", zip: i % 2 ? "44111" : "44107", land_use_code: "5100",
    year_built: i % 7 === 6 ? null : 1890 + i * 6, living_sqft: 900 + i * 110, lot_acres: 0.08 + (i % 5) * 0.06,
    style: "COL", garage_type: ["DETACHED", "ATTACHED", null][i % 3]!, gas_service: i % 6 !== 0,
    water_source: i % 9 === 0 ? "PVT" : "MUN", sewer_type: i % 8 === 0 ? "SP" : "SNS",
    market_value: 60000 + i * 17000, last_sale_date: i % 4 === 0 ? `2026-${String(1 + (i % 10)).padStart(2, "0")}-15` : "2012-05-01",
    last_sale_price: i % 4 === 0 ? 80000 + i * 9000 : 45000, owner_occupied_guess: i % 5 !== 1, is_rental: i % 5 === 1,
    is_condo: i === 13, tax_delinquent: i === 17, canopy_pct: (i * 13) % 70, grass_pct: (i * 11) % 65,
    flood_zone: i % 10 === 3 ? "AE" : i % 10 === 7 ? "X (0.2% annual chance)" : "X", in_sfha: i % 10 === 3,
    survey_2022: i % 3 === 0 ? { roof: SURVEY[i % 3]!, gutters: SURVEY[(i + 1) % 3]!, siding: SURVEY[(i + 2) % 3]!, paint_peeling: SURVEY[i % 2]! } : null,
  };
  const signals: Record<string, MaterializedSignal> = {};
  const cat = CATS[i % CATS.length]!;
  if (i % 2 === 0) signals[`last_permit:${cat}`] = { value: 0, evidence: { event_id: 1000 + i, date: `${2016 + (i % 10)}-04-02` } };
  if (i % 6 === 1) signals[`active_violation:${cat}`] = { value: 1, evidence: { event_id: 2000 + i, date: "2026-08-20" } };
  if (i % 5 === 2) signals[`neighbor_job:${cat}`] = { value: 1, evidence: { count: 2 + (i % 3), date: "2026-10-10", event_id: 3000 + i } };
  const recentEvents: RecentEvent[] = [];
  if (i % 4 === 0 && parcel.last_sale_date!.startsWith("2026-1")) {
    recentEvents.push({ id: 4000 + i, kind: "sale", category: null, event_date: parcel.last_sale_date!, source_url: null, amount: parcel.last_sale_price, arms_length: true, is_active: null });
  }
  if (i % 7 === 3) recentEvents.push({ id: 5000 + i, kind: "permit", category: CATS[(i + 3) % CATS.length]!, event_date: "2026-10-01", source_url: null, amount: null, arms_length: null, is_active: null });
  return {
    parcel, signals, recentEvents, today,
    coverage: i % 3 ? { permits: true, permits_since: 2015, violations: true } : { permits: false, violations: false },
    derived: { lot_pct: ((i * 7) % 20) / 19, living_pct: i / 19 },
    flags: { condemned: i === 19 },
    priors: { "no_recent_permit:roofing": 0.8, "neighbor_job:roofing": 0.02, "active_violation:roofing": 0.05 },
    parcelRecordUrl: `https://example.test/parcel/${i}`,
  };
}

const HOMES = Array.from({ length: 20 }, (_, i) => home(i));

describe("scoring determinism snapshot (spec 15)", () => {
  for (const key of ["roofing", "hvac", "fence", "lawn_care", "new_movers"]) {
    it(key, () => {
      const t = TEMPLATES[key]!;
      const profile = effectiveProfile(t);
      const out = HOMES.map((h) => {
        const f = passesFilters(h, profile);
        if (!f.ok) return { home: h.parcel.parcel_key, filtered: f.reason };
        const r = scoreParcel(t, profile, h);
        return { home: h.parcel.parcel_key, score: r.score, qualifies: r.qualifies, trigger: r.trigger, pitch: r.pitch, reasons: r.reasons };
      });
      expect(out).toMatchSnapshot();
      // Same input, same output, call after call.
      expect(HOMES.map((h) => scoreParcel(t, profile, h))).toEqual(HOMES.map((h) => scoreParcel(t, profile, h)));
    });
  }
});

describe("performance (spec 7.7)", () => {
  it("filters and scores 50K homes well inside the 5 s budget", () => {
    // The in-memory half of the budget; the full SQL + TS pass on real data is timed by
    // packages/ingest/src/tools/bench-score.ts (PLAN.md M3 result).
    const t = TEMPLATES.roofing!;
    const profile = effectiveProfile(t);
    const started = performance.now();
    let n = 0;
    for (let i = 0; i < 50_000; i++) {
      const h = HOMES[i % HOMES.length]!;
      if (!passesFilters(h, profile).ok) continue;
      scoreParcel(t, profile, h);
      n++;
    }
    expect(n).toBeGreaterThan(0);
    expect(performance.now() - started).toBeLessThan(2500);
  });
});
