// GET /api/settings/learned: the learned weight factors (spec 7.6). DELETE resets them and re-scores.
import { getDirectSql } from "@216leads/db";
import { learnedFor, resetLearned, scoreOrg } from "@216leads/ingest";
import { ApiError, apiOrg, handle, json } from "@/lib/api";

export const GET = handle(async () => {
  const { org } = await apiOrg();
  return json(await learnedFor(getDirectSql(), org.id));
});

export const DELETE = handle(async () => {
  const { org, role } = await apiOrg();
  if (role !== "owner") throw new ApiError(403, "Only the account owner can change scoring");
  const sql = getDirectSql();
  await resetLearned(sql, org.id);
  const stats = await scoreOrg(sql, org.id);
  return json({ ok: true, leads: stats.qualified });
});
