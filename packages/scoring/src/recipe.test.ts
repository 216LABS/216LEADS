import { describe, expect, it } from "vitest";
import { TEMPLATES } from "./generated";
import { isKnownSignal, parseRecipe } from "./recipe";
import { TRADES } from "../../shared/src/constants";

describe("presets (Addendum A1)", () => {
  it("has a preset for each of the 13 spec trades", () => {
    for (const t of TRADES) expect(TEMPLATES[t.key], t.key).toBeDefined();
  });

  for (const [key, t] of Object.entries(TEMPLATES)) {
    it(`${key} validates against the recipe schema`, () => {
      const r = parseRecipe(t);
      expect(r.ok ? [] : r.errors).toEqual([]);
    });
  }

  it("gutters fires on a same-home roofing permit; fence on a pool permit (A8)", () => {
    const has = (k: string, cat: string) => TEMPLATES[k]!.triggers.some((tr) => tr.kind === "permit" && tr.category === cat);
    expect(has("gutters", "roofing")).toBe(true);
    expect(has("fence", "pool")).toBe(true);
    expect(has("electrical", "pool")).toBe(true);
    expect(has("lawn_care", "new_build")).toBe(true);
  });
});

describe("recipe validation (Addendum A3)", () => {
  const base = TEMPLATES.roofing!;
  const bad = (patch: Record<string, unknown>) => parseRecipe({ ...base, ...patch });

  it("rejects signals outside the 7.2 library", () => {
    expect(isKnownSignal("last_permit_age:roofing")).toBe(true);
    expect(isKnownSignal("survey_condition:roof")).toBe(true);
    expect(isKnownSignal("last_permit_age:spaceships")).toBe(false);
    expect(isKnownSignal("credit_score")).toBe(false);
    expect(bad({ signals: { ...base.signals, credit_score: { weight: 10 } } }).ok).toBe(false);
  });

  it("rejects weights outside 0-40 and thresholds outside 40-80", () => {
    expect(bad({ signals: { new_owner: { weight: 41 }, home_age: { weight: 10 } } }).ok).toBe(false);
    expect(bad({ signals: { new_owner: { weight: 2.5 }, home_age: { weight: 10 } } }).ok).toBe(false);
    expect(bad({ threshold: 39 }).ok).toBe(false);
    expect(bad({ threshold: 81 }).ok).toBe(false);
  });

  it("rejects trigger categories outside 7.3", () => {
    expect(bad({ triggers: [{ kind: "permit", category: "yachts", within_days: 30, boost: 5, label: "x yachts" }] }).ok).toBe(false);
  });

  it("rejects unknown filter keys (no sneaking in owner data)", () => {
    expect(bad({ default_filters: { owner_name: "SMITH" } }).ok).toBe(false);
  });
});
