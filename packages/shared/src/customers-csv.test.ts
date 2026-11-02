import { describe, expect, it } from "vitest";
import { csvCell, customerLinesFromCsv } from "./customers-csv";

describe("customerLinesFromCsv", () => {
  it("uses named columns and drops everything else", () => {
    const csv = 'Name,Email,Street Address,City,Zip\n"Pat Q",pat@example.com,1234 W 117th St,Cleveland,44111\nNo Address,x@y.z,,Lakewood,44107\n';
    expect(customerLinesFromCsv(csv)).toEqual(["1234 W 117TH ST, 44111"]);
  });
  it("finds the address and zip without a header", () => {
    expect(customerLinesFromCsv("Jo,17 Elm Ave,44107\nJo again,17 Elm Ave,44107")).toEqual(["17 ELM AVE, 44107"]);
  });
  it("splits a one-cell full address", () => {
    expect(customerLinesFromCsv('address\n"1500 Lake Ave, Lakewood, OH 44107-1234"')).toEqual(["1500 LAKE AVE, 44107"]);
  });
  it("never returns a line without a street number and zip", () => {
    expect(customerLinesFromCsv("address,zip\nPO Box 12,44107\nMain St,44107")).toEqual([]);
  });
});

describe("csvCell", () => {
  it("quotes and defuses formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(null)).toBe("");
  });
});
