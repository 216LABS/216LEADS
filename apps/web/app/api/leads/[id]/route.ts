// GET /api/leads/:id (facts, reasons, timeline, notes, mail) and PATCH (status, won_amount,
// lost_reason, hidden). Leads of another org are a 404 (spec 13).
import { z } from "zod";
import { ApiError, apiOrg, body, handle, json } from "@/lib/api";
import { track } from "@/lib/events";
import { getLead, LeadPatchSchema, updateLeads } from "@/lib/leads";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { org, user } = await apiOrg();
  const lead = await getLead(org.id, (await params).id);
  if (!lead) throw new ApiError(404, "Lead not found");
  await track("lead_viewed", { orgId: org.id, userId: user.id }, { lead_id: lead.id });
  return json(lead);
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { org, user } = await apiOrg();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) throw new ApiError(404, "Lead not found");
  const patch = await body(req, LeadPatchSchema);
  const r = await updateLeads(org.id, [id], patch);
  if (!r.found) throw new ApiError(404, "Lead not found");
  for (const m of r.moved) await track("stage_changed", { orgId: org.id, userId: user.id }, { lead_id: m.id, from: m.from, to: m.to });
  return json({ ok: true, moved: r.moved.length });
});
