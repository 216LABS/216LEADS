// POST /api/profile/preview: re-count a draft recipe after a slider move (Addendum A4). No LLM.
import { z } from "zod";
import { apiUser, body, handle, json } from "@/lib/api";
import { draftRecipe, Multipliers, previewDraft, Zips } from "@/lib/profile";

const Body = z.object({ recipe: z.record(z.unknown()), zips: Zips, multipliers: Multipliers });

export const POST = handle(async (req: Request) => {
  const { ctx } = await apiUser();
  const input = await body(req, Body);
  return json(await previewDraft(draftRecipe(input.recipe), input.zips, input.multipliers, ctx?.org.id ?? null));
});
