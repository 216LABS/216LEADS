import { describe, expect, it } from "vitest";
import { violationItems } from "./violation-text";

describe("violationItems (Fix list)", () => {
  it("drops the guidesheet instructions, ordinance numbers and legal notices", () => {
    const raw = "Use this guidesheet for violations not contained in the boiler plate guide sheets. Enter ordinance number within brackets followed by violation description. [365.04] (b) FAILURE TO GET A LEAD SAFE CERTIFICATE PER 365.4 [3103.20(d)]: PROVIDES THE RIGHT OF APPEAL TO THE BOARD OF BUILDING STANDARDS. THIS APPEAL MUST BE FILED WITHIN 30 DAYS [3103.25(e)]: YOU ARE SUBJECT TO PROSECUTION AND PENALTIES.";
    expect(violationItems(raw)).toEqual(["(b) failure to get a lead safe certificate per 365.4"]);
  });

  it("keeps the finding when a notice shares its bracket (real Cleveland record)", () => {
    const raw = "Use this guidesheet for violations not contained in the boiler plate guide sheets.  Enter ordinance number within brackets followed by violation description. [365.04] (b) FAILURE TO GET A LEAD SAFE CERTIFICATE PER 365.4, LEAD SAFE CERTIFICATION FOR RESIDENTIAL RENTAL UNITS CONSTRUCTED BEFORE JANUARY 1, 1978.\n\nPROPERTY OWNER OR AGENT TO REFER TO THE LEAD RISK ASSESSMENT INSPECTION REPORT SUBMITTED TO THE CITY.\n\nPROPERTY OWNNER OR AGENT TO CONTACT AN APPROPRIATE OHIO DEPARTMENT OF HEALTH (ODH) CERTIFIED LEAD SERVICE PROVIDER.\n[3103.99(A)]: YOU ARE SUBJECT TO PROSECUTION AND PENALTIES.\n[3103.20]: PROVIDES THE RIGHT OF APPEAL TO THE BOARD OF BUILDING STANDARDS. THIS APPEAL MUST BE FILED WITHIN 30 DAYS FROM THE DATE OF ISSUANCE OF ANY VIOLATION NOTICE.";
    expect(violationItems(raw)).toEqual(["(b) failure to get a lead safe certificate per 365.4, lead safe certification for residential rental units constructed before january 1, 1978."]);
  });

  it("splits numbered findings and writes them in sentence case", () => {
    const raw = "6[369.13]: THE DOWNSPOUTS ARE DETERIORATED,DAMAGED, LEAKING. 2[369.15(b)]: THE ROOF IS NOT MAINTAINED WEATHER TIGHT AND DEVOID OF LEAKS.";
    expect(violationItems(raw)).toEqual(["The downspouts are deteriorated, damaged, leaking.", "The roof is not maintained weather tight and devoid of leaks."]);
  });

  it("keeps mixed-case text as written and removes repeats", () => {
    expect(violationItems("VACANT [3106.03(a)] Properties that are vacant shall be registered [3106.03(a)] Properties that are vacant shall be registered"))
      .toEqual(["Vacant", "Properties that are vacant shall be registered"]);
  });

  it("returns nothing for empty text or only notices", () => {
    expect(violationItems(null)).toEqual([]);
    expect(violationItems("18 [3105.26]: A LATE FEE WILL BE CHARGED WHEN APPLYING FOR A PERMIT AFTER STARTING WORK.")).toEqual([]);
  });
});

describe("violationItems keeps acronyms and place names", () => {
  it("writes HVAC and Ohio in their usual case", () => {
    expect(violationItems("[369.12]: THE HVAC SYSTEM IS NOT INSPECTED BY AN OHIO LICENSED CONTRACTOR.")).toEqual(["The HVAC system is not inspected by an Ohio licensed contractor."]);
  });
});
