import { describe, expect, it } from "vitest";
import { eventTitle } from "./event-title";

describe("eventTitle (issue #74)", () => {
  it("names the stored event kinds instead of showing them raw", () => {
    expect(eventTitle("rental_registration", "Rental registration")).toBe("Rental registration");
    expect(eventTitle("certificate_of_occupancy", null)).toBe("Certificate of occupancy");
  });

  it("drops a record type that only repeats the title", () => {
    expect(eventTitle("lead_safe", "Lead safe certificate")).toBe("Lead-safe certificate");
    expect(eventTitle("lead_safe", "Lead safe certificate - Clearance")).toBe("Lead-safe certificate: Lead safe certificate - Clearance");
  });

  it("keeps a type that adds detail", () => {
    expect(eventTitle("disclosure", "Certificate of disclosure")).toBe("Rental disclosure: Certificate of disclosure");
    expect(eventTitle("permit", "Furnace replacement")).toBe("Permit: Furnace replacement");
  });

  it("reads an unknown kind as words, not snake_case", () => {
    expect(eventTitle("tax_lien", null)).toBe("Tax lien");
  });
});
