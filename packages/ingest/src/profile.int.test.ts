// Addendum A8 on real data: every golden business type's recipe finds at least one lead in the
// Cleveland fixtures, and finishing the wizard creates an org that lands on scored leads.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closeAll, getDirectSql } from "@216leads/db";
import { activeRecipe } from "./recipes";
import { buildRecipe, createOrgFromWizard } from "./profile";
import { GOLDEN, goldenAnswers } from "./profile.golden";
import { previewTerritory, scoreOrg } from "./score";

const sql = getDirectSql();
const userId = randomUUID();
let orgId = "";

afterAll(async () => {
  if (orgId) await sql`delete from org where id = ${orgId}`;
  await sql`delete from auth.users where id = ${userId}`;
  await closeAll();
});

describe("profile wizard on the Cleveland fixtures (A8)", () => {
  for (const g of GOLDEN) {
    it(`${g.name}: the recipe finds at least 1 lead`, async () => {
      const a = goldenAnswers(g);
      const { recipe } = await buildRecipe(a, null);
      const p = await previewTerritory(sql, { template: recipe, zips: a.zips });
      expect(p.total).toBeGreaterThanOrEqual(1);
      expect(p.sample.length).toBeGreaterThan(0);
      expect(p.sample[0]!.reasons.length).toBeGreaterThan(0);
    });
  }

  it("finishing the wizard creates the org, territory, answers and active recipe, then scores leads", async () => {
    await sql`insert into auth.users (id, email) values (${userId}, ${`wizard-${userId}@test.local`})`;
    const a = goldenAnswers(GOLDEN[2]!);
    const { recipe } = await buildRecipe(a, null);
    orgId = await createOrgFromWizard(sql, { userId, email: "owner@test.local", answers: a, recipe, multipliers: { new_owner: 1.5 } });
    const [org] = await sql<{ trade: string; onboarded: boolean; zips: string[]; answers: { sells: string } }[]>`
      select o.trade, o.onboarded_at is not null as onboarded,
        (select array_agg(zip order by zip) from territory t where t.org_id = o.id) as zips,
        (select answers from org_profile p where p.org_id = o.id) as answers
      from org o where o.id = ${orgId}`;
    expect(org).toMatchObject({ trade: "fence", onboarded: true, zips: ["44107", "44111"] });
    expect(org!.answers.sells).toBe(a.sells);
    const v = await activeRecipe(sql, orgId);
    expect(v?.source).toBe("wizard");
    expect(v?.multipliers).toEqual({ new_owner: 1.5 });
    const s = await scoreOrg(sql, orgId);
    expect(s.qualified).toBeGreaterThan(0);
  });
});
