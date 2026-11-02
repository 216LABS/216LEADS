// Recipe versions end to end (Addendum A6): save a recipe, activate it, leads re-score; revert
// to the starting preset and the leads come back exactly as they were. Needs a seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAll, getDirectSql } from "@216leads/db";
import { getTemplate } from "@216leads/scoring";
import { activateRecipeVersion, activeRecipe, ensurePresetVersion, listRecipeVersions, RecipeInvalidError, saveRecipeVersion } from "./recipes";
import { loadOrgProfile, scoreOrg } from "./score";

const sql = getDirectSql();
let orgId = "";

beforeAll(async () => {
  const [demo] = await sql<{ id: string }[]>`select id from org where name = 'Demo Roofing' order by created_at limit 1`;
  if (!demo) throw new Error("Demo Roofing missing: run `pnpm db:seed` first");
  orgId = (await sql<{ id: string }[]>`insert into org (name, trade) values ('Recipe Test Roofing', 'roofing') returning id`)[0]!.id;
  await sql`insert into territory (org_id, kind, zip) select ${orgId}, kind, zip from territory where org_id = ${demo.id}`;
});

afterAll(async () => {
  if (orgId) await sql`delete from org where id = ${orgId}`;
  await closeAll();
});

async function leadMap() {
  const rows = await sql<{ parcel_key: string; score: number; reasons: unknown }[]>`
    select parcel_key, score, reasons from lead where org_id = ${orgId}`;
  return new Map(rows.map((r) => [r.parcel_key, { score: r.score, reasons: JSON.stringify(r.reasons) }]));
}

describe("recipe versions", () => {
  it("save -> activate re-scores leads; revert restores the preset's leads", async () => {
    await ensurePresetVersion(sql, orgId, "roofing");
    const preset = await activeRecipe(sql, orgId);
    expect(preset?.source).toBe("preset");
    await scoreOrg(sql, orgId);
    const before = await leadMap();
    expect(before.size).toBeGreaterThan(0);

    // A stricter recipe that leans on new owners: fewer homes qualify and scores move.
    const base = getTemplate("roofing");
    const tweak = {
      ...base,
      threshold: 70,
      signals: { ...base.signals, new_owner: { weight: 40 }, home_age: { weight: 0 } },
    };
    const saved = await saveRecipeVersion(sql, { orgId, recipe: tweak, source: "tweak", parentId: preset!.id, note: "test tweak", activate: true });
    expect((await activeRecipe(sql, orgId))?.id).toBe(saved.id);
    expect((await loadOrgProfile(sql, orgId)).template.threshold).toBe(70);

    const tweaked = await scoreOrg(sql, orgId);
    expect(tweaked.removed + tweaked.updated).toBeGreaterThan(0);
    const after = await leadMap();
    expect(after.size).toBeLessThan(before.size);

    await activateRecipeVersion(sql, orgId, preset!.id);
    expect((await activeRecipe(sql, orgId))?.id).toBe(preset!.id);
    expect((await loadOrgProfile(sql, orgId)).template.threshold).toBe(base.threshold);
    await scoreOrg(sql, orgId);
    expect(await leadMap()).toEqual(before);

    const versions = await listRecipeVersions(sql, orgId);
    expect(versions.map((v) => v.source).sort()).toEqual(["preset", "tweak"]);
    expect(versions.filter((v) => v.active).map((v) => v.id)).toEqual([preset!.id]);
  });

  it("refuses an invalid recipe and keeps the active version", async () => {
    const active = await activeRecipe(sql, orgId);
    const bad = { ...getTemplate("roofing"), signals: { "made_up_signal": { weight: 10 }, home_age: { weight: 10 } } };
    await expect(saveRecipeVersion(sql, { orgId, recipe: bad, source: "tweak", activate: true })).rejects.toBeInstanceOf(RecipeInvalidError);
    expect((await activeRecipe(sql, orgId))?.id).toBe(active!.id);
  });
});
