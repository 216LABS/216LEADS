// Spec 9.1 onboarding helpers against the seeded DB: area search, live counts with the
// exclusive "Taken" flag, and current-customer suppression.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAll, getDirectSql } from "@216leads/db";
import { areaCounts, importCustomers, searchAreas } from "./onboarding";
import { createOrgFromWizard } from "./profile";
import { loadSuppression } from "./score";
import { answersSchema, getTemplate } from "@216leads/scoring";

const sql = getDirectSql();
const orgs: string[] = [];
let userId = "";

beforeAll(async () => {
  userId = crypto.randomUUID();
  await sql`insert into auth.users (id, email) values (${userId}, ${`onb-${userId}@int.test`})`;
});

afterAll(async () => {
  if (orgs.length) await sql`delete from org where id = any(${orgs}::uuid[])`;
  await sql`delete from auth.users where id = ${userId}`;
  await closeAll();
});

describe("onboarding (spec 9.1)", () => {
  it("finds ZIPs by prefix and towns by name", async () => {
    const [p] = await sql<{ zip: string; name: string }[]>`
      select p.zip, m.name from parcel p join municipality m on m.id = p.municipality_id
      where is_residential(p.land_use_code, p.data_limited)
      group by p.zip, m.name order by count(*) desc limit 1`;
    const byZip = await searchAreas(sql, p!.zip.slice(0, 4));
    expect(byZip.some((m) => m.kind === "zip" && m.zips[0] === p!.zip)).toBe(true);
    const byTown = await searchAreas(sql, p!.name.slice(0, 4).toLowerCase());
    expect(byTown.find((m) => m.kind === "town")?.zips).toContain(p!.zip);
    expect(await searchAreas(sql, "x")).toEqual([]);
  });

  it("counts homes per ZIP and flags a ZIP another org holds exclusively", async () => {
    const zip = (await sql<{ zip: string }[]>`
      select zip from parcel where is_residential(land_use_code, data_limited) group by zip order by count(*) desc limit 1`)[0]!.zip;
    const holder = (await sql<{ id: string }[]>`insert into org (name, trade) values ('Lock Holder', 'roofing') returning id`)[0]!.id;
    orgs.push(holder);
    await sql`insert into exclusivity_lock (trade, zip, org_id) values ('roofing', ${zip}, ${holder})`;
    const [c] = await areaCounts(sql, "roofing", [zip], null);
    expect(c!.matching).toBeGreaterThan(0);
    expect(c!.taken).toBe(true);
    expect((await areaCounts(sql, "roofing", [zip], holder))[0]!.taken).toBe(false);
    expect((await areaCounts(sql, "hvac", [zip], null))[0]!.taken).toBe(false);
  });

  it("saves current customers as suppression at org creation, matched to homes", async () => {
    const homes = await sql<{ addr_line: string; zip: string; parcel_key: string }[]>`
      select addr_line, zip, parcel_key from parcel where is_residential(land_use_code, data_limited) and addr_line ~ '^[0-9]+ '
      order by parcel_key limit 3`;
    const lines = [...homes.map((h) => `${h.addr_line}, ${h.zip}`), "PO BOX 5, 44107", "garbage"];
    const answers = answersSchema.parse({ business_name: "Customers Co", sells: "Roofing", job_value: "2k_10k", zips: [homes[0]!.zip], preset: "roofing" });
    const orgId = await createOrgFromWizard(sql, {
      userId, email: `onb-${userId}@int.test`, answers, recipe: { ...getTemplate("roofing"), preset_base: "roofing" }, customers: lines,
    });
    orgs.push(orgId);
    const supp = await loadSuppression(sql, orgId);
    for (const h of homes) expect(supp.keys.has(h.parcel_key)).toBe(true);
    const [v] = await sql<{ source: string }[]>`select source::text from recipe_version where org_id = ${orgId} and active`;
    expect(v!.source).toBe("preset");
    // Re-importing is idempotent.
    expect((await importCustomers(sql, orgId, lines)).saved).toBe(3);
  });
});
