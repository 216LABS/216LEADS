import { describe, expect, it } from "vitest";
import { addrNormFromParts, maskAddress, normalizeAddress, zip5 } from "./address";
import { contractorNameNorm, looksLikeIndividual } from "./contractor";

const norm = (line: string, zip: string | number = "44111") => normalizeAddress(line, zip).addrNorm;

describe("normalizeAddress (spec section 6 cases)", () => {
  it("handles periods, ordinals and full suffix words", () => {
    expect(norm("1234 W. 117th Street")).toBe(norm("1234 W 117TH ST"));
    expect(normalizeAddress("1234 W. 117th Street", 44111).line).toBe("1234 W 117TH ST");
  });

  it("keeps numbered streets distinct from ordinals", () => {
    expect(norm("100 12 Ave")).not.toBe(norm("100 12th Ave"));
  });

  it("matches house-number ranges on the first number", () => {
    expect(norm("1234-1236 MAIN ST")).toBe(norm("1234 MAIN ST"));
  });

  it("treats numeric and string zips the same", () => {
    expect(norm("1 MAIN ST", 44107)).toBe(norm("1 MAIN ST", "44107"));
    expect(zip5(4410)).toBe("04410");
    expect(zip5("44107-1234")).toBe("44107");
  });

  it("drops the period in ST. CLAIR", () => {
    expect(norm("6000 ST. CLAIR AVE")).toBe(norm("6000 ST CLAIR AVE"));
    expect(norm("6000 SAINT CLAIR AVENUE")).toBe(norm("6000 ST CLAIR AVE"));
  });

  it("aliases MT and MOUNT", () => {
    expect(norm("100 MT VERNON BLVD")).toBe(norm("100 MOUNT VERNON BLVD"));
  });

  it("removes unit tokens", () => {
    const base = norm("1234 W 117TH ST");
    expect(norm("1234 W 117TH ST APT 2")).toBe(base);
    expect(norm("1234 W 117TH ST #2")).toBe(base);
    expect(norm("1234 W 117TH ST UNIT B")).toBe(base);
    expect(norm("1234 W 117TH ST REAR")).toBe(base);
    expect(norm("1234 W 117TH ST UP")).toBe(base);
    expect(norm("1234 W 117TH ST DN")).toBe(base);
    expect(normalizeAddress("1234 W 117TH ST APT 2", 44111).unit).toBe("APT 2");
  });

  it("does not read WEST BLVD as a direction", () => {
    const a = normalizeAddress("3500 WEST BLVD", 44111);
    expect(a.predir).toBe("");
    expect(a.street).toBe("WEST");
    expect(a.suffix).toBe("BLVD");
  });

  it("spells out directions", () => {
    expect(norm("1234 WEST 117TH STREET")).toBe(norm("1234 W 117TH ST"));
    expect(norm("500 EAST 185 ST")).toBe(norm("500 E 185 ST"));
  });

  it("builds from split county fields", () => {
    expect(addrNormFromParts({ houseNo: 1234, predir: "W", street: "117TH", suffix: "ST", zip: 44111 }).addrNorm)
      .toBe("1234 W 117TH ST|44111");
  });

  it("masks house numbers for public samples", () => {
    expect(maskAddress("1234 W 117TH ST")).toBe("12xx W 117th St");
    expect(maskAddress("12 MAIN ST")).toBe("1x Main St");
  });
});

describe("contractor names", () => {
  it("normalizes entity words", () => {
    expect(contractorNameNorm("Smith Roofing, LLC")).toBe("SMITH ROOFING");
    expect(contractorNameNorm("SMITH ROOFING INC.")).toBe("SMITH ROOFING");
  });
  it("flags names that look like people", () => {
    expect(looksLikeIndividual("JOHN Q SMITH")).toBe(true);
    expect(looksLikeIndividual("Smith Roofing LLC")).toBe(false);
    expect(looksLikeIndividual("ABC HEATING & COOLING")).toBe(false);
  });
});
