// POST /api/profile/activate (Addendum A7): save a draft recipe as the active version, or
// make an earlier version active again (Settings → revert). Re-scores the org's leads.
import { z } from "zod";
import { getDirectSql } from "@216leads/db";
import { activateRecipeVersion, RecipeInvalidError, saveRecipeVersion, scoreOrg } from "@216leads/ingest";
import { ApiError, apiOrg, body, handle, json } from "@/lib/api";

const Body = z.union([
  z.object({ version_id: z.string().uuid() }),
  z.object({
    recipe: z.record(z.unknown()),
    multipliers: z.record(z.number().min(0).max(2)).optional(),
    source: z.enum(["wizard", "tweak", "slider", "preset"]).default("wizard"),
    parent_id: z.string().uuid().nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  }),
]);

export const POST = handle(async (req: Request) => {
  const { org, user } = await apiOrg();
  const input = await body(req, Body);
  const sql = getDirectSql();
  let version;
  try {
    version = "version_id" in input
      ? await activateRecipeVersion(sql, org.id, input.version_id)
      : await saveRecipeVersion(sql, {
          orgId: org.id, recipe: input.recipe, multipliers: input.multipliers, source: input.source,
          parentId: input.parent_id, note: input.note, userId: user.id, activate: true,
        });
  } catch (e) {
    if (e instanceof RecipeInvalidError) throw new ApiError(422, e.message);
    if (e instanceof Error && e.message === "Recipe version not found") throw new ApiError(404, e.message);
    throw e;
  }
  const stats = await scoreOrg(sql, org.id);
  return json({ version: { id: version.id, source: version.source, active: true }, leads: stats.qualified });
});
