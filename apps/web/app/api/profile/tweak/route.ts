// POST /api/profile/tweak (Addendum A7): current recipe + "tweak it" instruction -> new draft,
// a plain-English diff and a fresh preview. Nothing is saved until /api/profile/activate.
import { z } from "zod";
import { tweakRecipe } from "@216leads/ingest";
import { recipeDiff } from "@216leads/scoring";
import { ApiError, apiUser, body, handle, json } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { draftRecipe, Multipliers, previewDraft, Zips } from "@/lib/profile";

const Body = z.object({ recipe: z.record(z.unknown()), instruction: z.string().trim().min(2).max(300), zips: Zips, multipliers: Multipliers });

export const POST = handle(async (req: Request) => {
  const { user, ctx } = await apiUser();
  const input = await body(req, Body);
  if (!rateLimit(`llm:${user.id}`, 10, 10 * 60_000)) throw new ApiError(429, "That's a lot of tweaks. Try again in a few minutes.");
  const before = draftRecipe(input.recipe);
  const t = await tweakRecipe(before, input.instruction);
  return json({
    recipe: t.recipe, via: t.via, understood: t.understood, diff: recipeDiff(before, t.recipe),
    ...(await previewDraft(t.recipe, input.zips, input.multipliers, ctx?.org.id ?? null)),
  });
});
