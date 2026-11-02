// POST /api/profile/build (Addendum A7): wizard answers -> recipe draft + preview. One LLM call
// at most; with no key, or on invalid LLM output, the closest preset (no user-facing error).
import { buildRecipe } from "@216leads/ingest";
import { answersSchema } from "@216leads/scoring";
import { ApiError, apiUser, body, handle, json } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { previewDraft } from "@/lib/profile";

export const POST = handle(async (req: Request) => {
  const { user, ctx } = await apiUser();
  const answers = await body(req, answersSchema);
  if (!(await rateLimit(`llm:${user.id}`, 10, 10 * 60_000))) throw new ApiError(429, "That's a lot of rebuilds. Try again in a few minutes.");
  const { recipe, via } = await buildRecipe(answers);
  return json({ recipe, via, ...(await previewDraft(recipe, answers.zips, {}, ctx?.org.id ?? null)) });
});
