// POST /api/profile/activate (Addendum A7): save a draft recipe as the active version, or
// make an earlier version active again (Settings → revert). Re-scores the org's leads.
// A signed-in user with no org yet is finishing the onboarding wizard: the org is created from
// their answers first.
import { z } from "zod";
import { getDirectSql } from "@216leads/db";
import {
  activateRecipeVersion, createOrgFromWizard, CUSTOMER_LINES_MAX, importCustomers, RecipeInvalidError, saveOrgAnswers, saveRecipeVersion, scoreOrg,
} from "@216leads/ingest";
import { answersSchema } from "@216leads/scoring";
import { ApiError, apiUser, body, handle, json } from "@/lib/api";
import { track } from "@/lib/events";
import { draftRecipe } from "@/lib/profile";

const Draft = z.object({
  recipe: z.record(z.unknown()),
  multipliers: z.record(z.number().min(0).max(2)).optional(),
  source: z.enum(["wizard", "tweak", "slider", "preset"]).default("wizard"),
  parent_id: z.string().uuid().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  answers: answersSchema.optional(),
  /** "Upload my current customers" (spec 9.1 step 3): address lines only, hidden from leads. */
  customers: z.array(z.string().max(200)).max(CUSTOMER_LINES_MAX).optional(),
});
const Body = z.union([z.object({ version_id: z.string().uuid() }), Draft]);

export const POST = handle(async (req: Request) => {
  const { user, ctx } = await apiUser();
  const input = await body(req, Body);
  const sql = getDirectSql();

  if (!ctx) {
    if ("version_id" in input || !input.answers) throw new ApiError(403, "Finish onboarding first");
    const orgId = await createOrgFromWizard(sql, {
      userId: user.id, email: user.email, answers: input.answers, recipe: draftRecipe(input.recipe), multipliers: input.multipliers,
      customers: input.customers,
    });
    const stats = await scoreOrg(sql, orgId);
    await track("onboarding_done", { orgId, userId: user.id }, {
      path: input.answers.preset ? "preset" : "wizard", leads: stats.qualified, zips: input.answers.zips.length, customers: input.customers?.length ?? 0,
    });
    return json({ org_id: orgId, leads: stats.qualified });
  }

  const { org } = ctx;
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
  if (!("version_id" in input) && input.answers) {
    await saveOrgAnswers(sql, org.id, input.answers);
    await sql`update org set onboarded_at = coalesce(onboarded_at, now()) where id = ${org.id}`;
  }
  if (!("version_id" in input) && input.customers?.length) await importCustomers(sql, org.id, input.customers);
  const stats = await scoreOrg(sql, org.id);
  return json({ version: { id: version.id, source: version.source, active: true }, leads: stats.qualified });
});
