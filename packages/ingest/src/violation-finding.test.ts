import { describe, expect, it } from "vitest";
import { violationFinding } from "./signals";

// The Governor Ave citation from the old Fix list: owner-responsibility boilerplate first, the heating
// finding later. The lead's reason should quote the heating part.
const GOVERNOR = "The owner of the premises subject to the provisions of this building code shall be responsible for compliance with the standards set forth herein. [369.06]: HEATING SYSTEMS SHALL BE DESIGNED, INSTALLED AND OPERATED TO MAINTAIN INSIDE AIR TEMPERATURES OF NOT LESS THAN 70 DEGREES F. [369.12]: IN ORDER TO COMPLY WITH ABOVE VIOLATION YOU MUST SECURE THE SERVICES OF A REGISTERED HEATING CONTRACTOR. Needs a heat certification. Gas valve inoperable.";

describe("violationFinding", () => {
  it("quotes the finding that concerns the trade, not the first boilerplate sentence", () => {
    const f = violationFinding(GOVERNOR, "hvac")!;
    expect(f).toMatch(/^Heating systems shall be designed/);
    expect(f.length).toBeLessThanOrEqual(140);
  });

  it("falls back to the first finding, and is null when there is nothing readable", () => {
    expect(violationFinding("[369.13]: THE GUTTERS ARE HANGING AND NOT PROPERLY SECURED.", "hvac")).toBe("The gutters are hanging and not properly secured.");
    expect(violationFinding(null, "hvac")).toBeNull();
    expect(violationFinding("[3103.99(A)]: YOU ARE SUBJECT TO PROSECUTION AND PENALTIES.", "hvac")).toBeNull();
  });
});
