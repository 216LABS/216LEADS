// Spec 13 exclusivity against the seeded DB: one lock per trade+ZIP (409 "Taken"), rollback on
// conflict, release on plan change, and the 72-hour visibility delay for everyone else.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAll, getDirectSql } from "@216leads/db";
import { answersSchema, getTemplate } from "@216leads/scoring";
import { orgExclusiveZips, orgZips, releaseExclusiveLocks, setZipTerritories, TakenError } from "./settings";
import { createOrgFromWizard } from "./profile";
import { scoreOrg } from "./score";

const sql = getDirectSql();
const orgs: string[] = [];
let userId = "";
let zip = "";

const newOrg = async (name: string, trade: string, plan = "exclusive") => {
  const id = (await sql<{ id: string }[]>`insert into org (name, trade, plan) values (${name}, ${trade}, ${plan}) returning id`)[0]!.id;
  orgs.push(id);
  return id;
};

beforeAll(async () => {
  userId = crypto.randomUUID();
  await sql`insert into auth.users (id, email) values (${userId}, ${`exc-${userId}@int.test`})`;
  zip = (await sql<{ zip: string }[]>`
    select zip from parcel where is_residential(land_use_code, data_limited) group by zip order by count(*) desc limit 1`)[0]!.zip;
});

afterAll(async () => {
  if (orgs.length) await sql`delete from org where id = any(${orgs}::uuid[])`;
  await sql`delete from auth.users where id = ${userId}`;
  await closeAll();
});

describe("exclusivity (spec 13)", () => {
  it("locks a trade+ZIP for one org; a second org gets Taken and nothing is saved", async () => {
    const holder = await newOrg("Exclusive Holder", "roofing");
    const rival = await newOrg("Exclusive Rival", "roofing");
    const hvac = await newOrg("Exclusive HVAC", "hvac");
    await setZipTerritories(sql, holder, [zip], { trade: "roofing", zips: [zip], max: 5 });
    expect(await orgExclusiveZips(sql, holder)).toEqual([zip]);

    const err = await setZipTerritories(sql, rival, [zip, "44107"], { trade: "roofing", zips: [zip], max: 5 }).catch((e) => e);
    expect(err).toBeInstanceOf(TakenError);
    expect((err as TakenError).zips).toEqual([zip]);
    expect(await orgZips(sql, rival)).toEqual([]); // rolled back
    // Same ZIP without asking for exclusivity is fine; a different trade can lock it too.
    expect(await setZipTerritories(sql, rival, [zip])).toEqual([zip]);
    await setZipTerritories(sql, hvac, [zip], { trade: "hvac", zips: [zip], max: 5 });
    expect(await orgExclusiveZips(sql, hvac)).toEqual([zip]);

    // Only ZIPs in the area count, capped at the plan's number.
    await setZipTerritories(sql, holder, [zip, "44107", "44111"], { trade: "roofing", zips: [zip, "44111", "44999"], max: 1 });
    expect(await orgExclusiveZips(sql, holder)).toEqual([zip]);
    const flags = await sql<{ zip: string; is_exclusive: boolean }[]>`select zip, is_exclusive from territory where org_id = ${holder} order by zip`;
    expect(flags.filter((f) => f.is_exclusive).map((f) => f.zip)).toEqual([zip]);
  });

  it("delays everyone else's new leads in a locked ZIP by 72 hours", async () => {
    const answers = answersSchema.parse({ business_name: "Delayed Roofer", sells: "Roofing", job_value: "2k_10k", zips: [zip], preset: "roofing" });
    const delayed = await createOrgFromWizard(sql, {
      userId, email: `exc-${userId}@int.test`, answers, recipe: { ...getTemplate("roofing"), preset_base: "roofing" },
    });
    orgs.push(delayed);
    await scoreOrg(sql, delayed);
    const [r] = await sql<{ n: number; visible: number; min_h: number }[]>`
      select count(*)::int as n, count(*) filter (where visible_from <= now())::int as visible,
        coalesce(min(extract(epoch from visible_from - first_surfaced_at) / 3600), 0)::float as min_h
      from lead where org_id = ${delayed}`;
    expect(r!.n).toBeGreaterThan(0);
    expect(r!.visible).toBe(0);
    expect(r!.min_h).toBeGreaterThan(71.9);
  });

  it("frees the ZIP when the holder leaves the Exclusive plan", async () => {
    const [holder, rival] = orgs as [string, string];
    expect(await releaseExclusiveLocks(sql, holder)).toBe(1);
    expect(await orgExclusiveZips(sql, holder)).toEqual([]);
    await setZipTerritories(sql, rival, [zip], { trade: "roofing", zips: [zip], max: 5 });
    expect(await orgExclusiveZips(sql, rival)).toEqual([zip]);
    // Saving without exclusivity (not on the Exclusive plan) releases the org's locks.
    await setZipTerritories(sql, rival, [zip]);
    expect(await orgExclusiveZips(sql, rival)).toEqual([]);
  });
});
