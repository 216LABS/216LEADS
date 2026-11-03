import { describe, expect, it } from "vitest";
import { floodZoneText, homeStyle } from "./parcel-text";

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
