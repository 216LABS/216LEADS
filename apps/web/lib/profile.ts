import "server-only";
import { z } from "zod";
import { getSql } from "@216leads/db";
import { previewTerritory, type Recipe } from "@216leads/ingest";
import { describeRecipe, parseRecipe } from "@216leads/scoring";
import { ApiError } from "./api";

export const Zips = z.array(z.string().regex(/^\d{5}$/)).min(1).max(25);
export const Multipliers = z.record(z.number().min(0).max(2)).default({});

/** A draft recipe from the client, re-validated on every request. */
export function draftRecipe(input: unknown): Recipe {
  const parsed = parseRecipe(input);
  if (!parsed.ok) throw new ApiError(422, `Invalid recipe: ${parsed.errors.slice(0, 3).join("; ")}`);
  return parsed.recipe as Recipe;
}

/** Confirm-screen data (Addendum A4): summary, live count and 5 sample homes, all from the engine. */
export async function previewDraft(recipe: Recipe, zips: string[], multipliers: Record<string, number>, orgId: string | null) {
  const p = await previewTerritory(getSql(), { template: recipe, zips, profile: { weights: multipliers }, orgId });
  return { summary: describeRecipe(recipe), count: p.total, zips: p.zips, sample: p.sample };
}
