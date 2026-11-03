import { describe, expect, it } from "vitest";
import { countOf, floodZoneText, homeStyle } from "./parcel-text";
import { tradeInText } from "./constants";

describe("homeStyle (issue #74: lead detail showed \"Col\")", () => {
  it.each([
    ["COL", "Colonial"],
    ["CAP, COL", "Cape Cod, Colonial"],
    ["COL, COL", "Colonial"],
    ["ran", "Ranch"],
    ["WU", null],
    ["ELE, COL", "Colonial"],
    [null, null],
  ])("%s -> %s", (code, name) => expect(homeStyle(code)).toBe(name));
});

describe("floodZoneText (issue #74: lead detail showed \"X\")", () => {
  it.each([
    ["X", false, "Minimal risk (zone X)"],
    ["X 0.2%", false, "Moderate risk (zone X, 0.2% chance a year)"],
    ["AE", true, "High risk (zone AE)"],
    ["A", false, "High risk (zone A)"],
    ["VE", false, "High risk (zone VE)"],
    ["D", false, "Not yet studied (zone D)"],
    [null, false, null],
  ] as const)("%s (sfha %s) -> %s", (zone, sfha, text) => expect(floodZoneText(zone, sfha)).toBe(text));
});

describe("countOf", () => {
  it("uses the singular for exactly one", () => {
    expect(countOf(1, "home")).toBe("1 home");
    expect(countOf(1, "address")).toBe("1 address");
  });
  it("pluralizes and formats other counts", () => {
    expect(countOf(0, "home")).toBe("0 homes");
    expect(countOf(2000, "home")).toBe("2,000 homes");
    expect(countOf(3, "address")).toBe("3 addresses");
  });
});

describe("tradeInText (issue #72)", () => {
  it("keeps acronyms and lowers words", () => {
    expect(tradeInText("hvac")).toBe("HVAC");
    expect(tradeInText("roofing")).toBe("roofing");
  });
});
