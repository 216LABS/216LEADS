import { describe, expect, it } from "vitest";
import { effectiveProfile, passesFilters, scoreParcel } from "./engine";
import { TEMPLATES } from "./generated";
import type { ParcelFacts, RecentEvent, ScoreInput } from "./types";

const today = "2026-11-01";

const parcel = (over: Partial<ParcelFacts> = {}): ParcelFacts => ({
  parcel_key: "cuyahoga:00000001", addr_line: "1 TEST ST", city: "CLEVELAND", zip: "44111", land_use_code: "5100",
  year_built: 1925, living_sqft: 1400, lot_acres: 0.15, style: "COL", garage_type: "DETACHED", gas_service: true,
  water_source: "MUN", sewer_type: "SNS", market_value: 150000, last_sale_date: "2015-06-01", last_sale_price: 90000,
  owner_occupied_guess: true, is_rental: false, is_condo: false, tax_delinquent: false, canopy_pct: 30, grass_pct: 30,
  flood_zone: "X", in_sfha: false, survey_2022: null, ...over,
});

const input = (over: Partial<ScoreInput> = {}, p: Partial<ParcelFacts> = {}): ScoreInput => ({
  parcel: parcel(p), signals: {}, coverage: { permits: true, permits_since: 2015, violations: true },
  derived: { lot_pct: 0.5, living_pct: 0.5 }, recentEvents: [], today, ...over,
});

const permit = (category: string, event_date: string, id = 1): RecentEvent => ({
  id, kind: "permit", category, event_date, source_url: null, amount: null, arms_length: null, is_active: null,
});

describe("scoring engine", () => {
  it("is deterministic", () => {
    const t = TEMPLATES.roofing!;
    const p = effectiveProfile(t);
    expect(scoreParcel(t, p, input())).toEqual(scoreParcel(t, p, input()));
  });

  it("scores stay within 0-100 and reasons are ordered by contribution", () => {
    for (const t of Object.values(TEMPLATES)) {
      const r = scoreParcel(t, effectiveProfile(t), input());
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      const pts = r.reasons.map((x) => x.points);
      expect([...pts].sort((a, b) => b - a)).toEqual(pts);
      expect(r.reasons.length).toBeLessThanOrEqual(5);
    }
  });

  it("fires an adjacent-permit trigger on the same home within the window (A5)", () => {
    const t = TEMPLATES.gutters!;
    const p = effectiveProfile(t);
    const fired = scoreParcel(t, p, input({ recentEvents: [permit("roofing", "2026-10-15", 7)] }));
    expect(fired.trigger).toMatchObject({ kind: "permit", event_id: 7, date: "2026-10-15" });
    const base = scoreParcel(t, p, input());
    expect(fired.score).toBe(Math.min(100, base.score + 12));
    // Outside the 60-day window: no trigger.
    expect(scoreParcel(t, p, input({ recentEvents: [permit("roofing", "2026-07-01")] })).trigger).toBeNull();
    // A different category does nothing for gutters.
    expect(scoreParcel(t, p, input({ recentEvents: [permit("hvac", "2026-10-15")] })).trigger).toBeNull();
  });

  it("the biggest trigger boost wins", () => {
    const t = TEMPLATES.fence!;
    const r = scoreParcel(t, effectiveProfile(t), input({
      recentEvents: [permit("pool", "2026-10-20", 1), permit("new_build", "2026-10-25", 2)],
    }));
    expect(r.trigger?.event_id).toBe(1); // pool boost 14 beats new_build 12
  });

  it("uses population averages when a town has no permit data", () => {
    const t = TEMPLATES.roofing!;
    const p = effectiveProfile(t);
    const noData = input({ coverage: { permits: false, violations: false }, priors: { "no_recent_permit:roofing": 0.87 } });
    const r = scoreParcel(t, p, noData);
    expect(r.reasons.some((x) => x.key === "no_recent_permit:roofing")).toBe(false); // never a reason without a record
    expect(r.score).toBeGreaterThan(0);
  });

  it("lets an open citation in the trade through the owner-occupied filter", () => {
    const hvac = effectiveProfile(TEMPLATES.hvac!);
    const cited = { "active_violation:hvac": { value: 1, evidence: { date: "2026-03-13", finding: "Gas valve inoperable" } } };
    expect(passesFilters(input({}, { owner_occupied_guess: false }), hvac, TEMPLATES.hvac)).toEqual({ ok: false, reason: "not_owner_occupied" });
    expect(passesFilters(input({ signals: cited }, { owner_occupied_guess: false }), hvac, TEMPLATES.hvac)).toEqual({ ok: true });
    // A citation for another trade doesn't count.
    const roofCited = { "active_violation:roofing": { value: 1, evidence: {} } };
    expect(passesFilters(input({ signals: roofCited }, { owner_occupied_guess: false }), hvac, TEMPLATES.hvac)).toEqual({ ok: false, reason: "not_owner_occupied" });
  });

  it("applies hard filters before scoring", () => {
    const t = TEMPLATES.septic!;
    const p = effectiveProfile(t);
    expect(passesFilters(input({}, { sewer_type: "SNS" }), p)).toEqual({ ok: false, reason: "sewer" });
    expect(passesFilters(input({}, { sewer_type: "SP" }), p)).toEqual({ ok: true });
    const roof = effectiveProfile(TEMPLATES.roofing!);
    expect(passesFilters(input({ flags: { demolished: true } }), roof)).toEqual({ ok: false, reason: "demolished" });
    expect(passesFilters(input({}, { is_condo: true }), roof)).toEqual({ ok: false, reason: "condo" });
  });
});
