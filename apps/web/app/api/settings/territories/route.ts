// GET/PUT /api/settings/territories (spec 8): the org's ZIP codes. Saving re-scores the leads.
// Zip count is capped by the plan (spec 11); exclusive locks come with M10.
import { z } from "zod";
import { getDirectSql } from "@216leads/db";
import { orgZips, scoreOrg, setZipTerritories } from "@216leads/ingest";
import { planLimits } from "@216leads/shared";
import { ApiError, apiOrg, body, handle, json } from "@/lib/api";
import { Zips } from "@/lib/profile";

export const GET = handle(async () => {
  const { org } = await apiOrg();
  return json({ zips: await orgZips(getDirectSql(), org.id) });
});

export const PUT = handle(async (req: Request) => {
  const { org, role } = await apiOrg();
  if (role !== "owner") throw new ApiError(403, "Only the account owner can change the area");
  const { zips } = await body(req, z.object({ zips: Zips }));
  const max = planLimits(org.plan).maxZips;
  if (new Set(zips).size > max) throw new ApiError(402, `Your plan covers ${max} ZIP codes. Upgrade in Settings → Billing for more.`);
  const sql = getDirectSql();
  const saved = await setZipTerritories(sql, org.id, zips);
  const stats = await scoreOrg(sql, org.id);
  return json({ zips: saved, leads: stats.qualified });
});
