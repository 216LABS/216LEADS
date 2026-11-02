// Spec 9.1 step 3 controls: reading and writing a recipe's filters and exclusions.
import { describe, expect, it } from "vitest";
import { TEMPLATES } from "./generated";
import { applyCustomerControls, customerControls } from "./profile";
import { parseRecipe } from "./recipe";

const Y = 2026;

describe("perfect-customer controls", () => {
  it("round-trips every control and keeps the recipe valid", () => {
    const t = TEMPLATES.roofing!;
    const c = { ...customerControls(t, Y), age: "pre1950" as const, lot: "0.5" as const, heat: "no_gas" as const, price_min: 100000, price_max: 400000,
      owner_occupied: true, rentals: true, condos: true, streets: [" w 117th st ", "W 117TH ST"] };
    const r = applyCustomerControls(t, c, Y);
    expect(parseRecipe(r).ok).toBe(true);
    expect(r.default_filters).toMatchObject({ year_built_max: 1949, lot_acres_min: 0.5, gas: "no_gas", price_min: 100000, price_max: 400000, owner_occupied: true });
    expect(r.default_exclusions).toMatchObject({ rentals: true, condos: true, streets: ["W 117TH ST"] });
    expect(r.signals.price_band).toBeDefined();
    expect(customerControls(r, Y)).toMatchObject({ age: "pre1950", lot: "0.5", heat: "no_gas", streets: ["W 117TH ST"] });
  });

  it("leaves a preset's own lot filter alone unless the lot control changes", () => {
    const t = TEMPLATES.lawn_care!; // lot >= 0.15 ac
    expect(t.default_filters.lot_acres_min).toBe(0.15);
    const r = applyCustomerControls(t, { ...customerControls(t, Y), owner_occupied: true }, Y);
    expect(r.default_filters.lot_acres_min).toBe(0.15);
    expect(applyCustomerControls(t, { ...customerControls(t, Y), lot: "1" }, Y).default_filters.lot_acres_min).toBe(1);
  });

  it("maps home age to a year_built limit", () => {
    const t = TEMPLATES.hvac!;
    expect(applyCustomerControls(t, { ...customerControls(t, Y), age: "30" }, Y).default_filters.year_built_max).toBe(1996);
    expect(applyCustomerControls(t, { ...customerControls(t, Y), age: "any" }, Y).default_filters.year_built_max).toBeNull();
  });
});
