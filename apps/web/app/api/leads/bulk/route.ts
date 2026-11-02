// POST /api/leads/bulk: one status change for many leads (desktop multi-select, spec 9.2).
import { z } from "zod";
import { ApiError, apiOrg, body, handle, json } from "@/lib/api";
import { track } from "@/lib/events";
import { STATUSES, updateLeads } from "@/lib/leads";

const Body = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), status: z.enum(STATUSES) });

export const POST = handle(async (req: Request) => {
  const { org, user } = await apiOrg();
  const { ids, status } = await body(req, Body);
  const r = await updateLeads(org.id, ids, { status });
  if (!r.found) throw new ApiError(404, "None of these leads are in your account");
  for (const m of r.moved) await track("stage_changed", { orgId: org.id, userId: user.id }, { lead_id: m.id, from: m.from, to: m.to, bulk: true });
  return json({ ok: true, updated: r.found, moved: r.moved.length });
});
