import { describe, expect, it } from "vitest";
import { getTemplate } from "@216leads/scoring";
import { withNewPresetParts } from "./score";

describe("withNewPresetParts (saved recipes pick up new preset signals)", () => {
  // A recipe saved before city citations were part of HVAC scoring, with the account's own filters.
  const preset = getTemplate("hvac");
  const { "active_violation:hvac": _, ...oldSignals } = preset.signals;
  const saved = {
    ...preset,
    signals: { ...oldSignals, "new_owner": { weight: 0 } },
    triggers: preset.triggers.filter((t) => t.kind !== "violation"),
    default_filters: { ...preset.default_filters, price_min: 150000, year_built_max: 1949 },
  };

  it("adds the signal and trigger the preset gained", () => {
    const r = withNewPresetParts(saved);
    expect(r.signals["active_violation:hvac"]).toEqual(preset.signals["active_violation:hvac"]);
    expect(r.triggers.some((t) => t.kind === "violation")).toBe(true);
  });

  it("keeps everything the account saved", () => {
    const r = withNewPresetParts(saved);
    expect(r.default_filters).toEqual(saved.default_filters);
    expect(r.signals["new_owner"]).toEqual({ weight: 0 });
    expect(r.triggers.filter((t) => t.kind === "sale")).toHaveLength(1);
  });

  it("leaves a recipe with no known preset alone", () => {
    const custom = { ...saved, key: "custom-thing", preset_base: null };
    expect(withNewPresetParts(custom)).toBe(custom);
  });
});
