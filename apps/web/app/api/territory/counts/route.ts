// POST /api/territory/counts: live per-ZIP counts for the area chips, plus "Taken" when another
// org holds the exclusive lock for this trade (spec 9.1 step 2). Preset scoring, no LLM.
import { z } from "zod";
import { getSql } from "@216leads/db";
import { areaCounts } from "@216leads/ingest";
import { hasTemplate } from "@216leads/scoring";
import { ApiError, apiUser, body, handle, json } from "@/lib/api";
import { Zips } from "@/lib/profile";

const Body = z.object({ trade: z.string(), zips: Zips });

export const POST = handle(async (req: Request) => {
  const { ctx } = await apiUser();
  const input = await body(req, Body);
  if (!hasTemplate(input.trade)) throw new ApiError(422, "Unknown trade");
  return json({ zips: await areaCounts(getSql(), input.trade, input.zips, ctx?.org.id ?? null) });
});
