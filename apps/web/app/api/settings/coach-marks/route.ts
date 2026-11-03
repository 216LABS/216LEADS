// POST /api/settings/coach-marks: the org has seen the first-visit tips.
import { getSql } from "@216leads/db";
import { apiOrg, handle, json } from "@/lib/api";

export const POST = handle(async () => {
  const { org } = await apiOrg();
  await getSql()`update org set coach_marks_seen = true where id = ${org.id}`;
  return json({ ok: true });
});
