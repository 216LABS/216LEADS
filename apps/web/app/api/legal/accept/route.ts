// POST /api/legal/accept: the "ok" on the updated-terms banner writes a new acceptance row (issue #3).
import { apiOrg, handle, json } from "@/lib/api";
import { recordAcceptance } from "@/lib/legal";

export const POST = handle(async () => {
  const { org, user } = await apiOrg();
  await recordAcceptance(user.id, org.id);
  return json({ ok: true });
});
