// GET/PUT /api/settings/territories (spec 8): the org's ZIP codes. Saving re-scores the leads.
// Zip count is capped by the plan (spec 11). On the Exclusive plan, `exclusive` ZIPs are locked
// for the org's trade (spec 13); one another business already holds returns 409 "Taken".
import { z } from "zod";
import { getSql } from "@216leads/db";
import { orgExclusiveZips, orgZips, scoreOrg, setZipTerritories, TakenError } from "@216leads/ingest";
import { planLimits } from "@216leads/shared";
import { ApiError, apiOrg, body, handle, json } from "@/lib/api";
import { Zips } from "@/lib/profile";

export const GET = handle(async () => {
  const { org } = await apiOrg();
  const sql = getSql();
  return json({ zips: await orgZips(sql, org.id), exclusive: await orgExclusiveZips(sql, org.id) });
});

export const PUT = handle(async (req: Request) => {
  const { org, role } = await apiOrg();
  if (role !== "owner") throw new ApiError(403, "Only the account owner can change the area");
  const { zips, exclusive } = await body(req, z.object({ zips: Zips, exclusive: z.array(z.string().regex(/^\d{5}$/)).max(25).optional() }));
  const limits = planLimits(org.plan);
  if (new Set(zips).size > limits.maxZips) throw new ApiError(402, `Your plan covers ${limits.maxZips} ZIP codes. Upgrade in Settings → Billing for more.`);
  const lock = [...new Set(exclusive ?? [])];
  if (lock.length && org.plan !== "exclusive") throw new ApiError(402, "Exclusive ZIP codes come with the Exclusive plan. Upgrade in Settings → Billing.");
  if (lock.length > limits.exclusiveZips) throw new ApiError(402, `Your plan holds up to ${limits.exclusiveZips} ZIP codes exclusively.`);
  const sql = getSql();
  let saved: string[];
  try {
    saved = await setZipTerritories(sql, org.id, zips,
      org.plan === "exclusive" ? { trade: org.trade, zips: exclusive ?? (await orgExclusiveZips(sql, org.id)), max: limits.exclusiveZips } : undefined);
  } catch (e) {
    if (e instanceof TakenError) return json({ error: e.message, taken: e.zips }, 409);
    throw e;
  }
  const stats = await scoreOrg(sql, org.id);
  return json({ zips: saved, exclusive: await orgExclusiveZips(sql, org.id), leads: stats.qualified });
});
