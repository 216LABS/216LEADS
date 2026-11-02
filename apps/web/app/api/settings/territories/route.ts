// GET/PUT /api/settings/territories (spec 8): the org's ZIP codes. Saving re-scores the leads.
// Plan zip limits arrive with billing (M7) and exclusive locks with M10.
import { z } from "zod";
import { getDirectSql } from "@216leads/db";
import { orgZips, scoreOrg, setZipTerritories } from "@216leads/ingest";
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
  const sql = getDirectSql();
  const saved = await setZipTerritories(sql, org.id, zips);
  const stats = await scoreOrg(sql, org.id);
  return json({ zips: saved, leads: stats.qualified });
});
