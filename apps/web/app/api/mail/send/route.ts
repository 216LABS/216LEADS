// POST /api/mail/send (spec 8, 10.3): lead_ids[] (or parcel keys from the map) + template_id.
// Without confirm it returns the cost preview and removal counts; with confirm=true it queues
// the pieces with a 15-minute undo and emails the batch confirmation.
import { z } from "zod";
import { apiActiveOrg, body, handle } from "@/lib/api";
import { MergeSchema } from "@/lib/mail";
import { sendHomes } from "@/lib/send";

const Body = z.object({
  lead_ids: z.array(z.string().uuid()).max(500).default([]),
  parcel_keys: z.array(z.string().max(60)).max(500).default([]),
  template_id: z.string().uuid(),
  merge: MergeSchema.optional(),
  confirm: z.boolean().default(false),
}).refine((b) => b.lead_ids.length + b.parcel_keys.length > 0, "Pick at least one home");

export const POST = handle(async (req: Request) => {
  const ctx = await apiActiveOrg();
  const b = await body(req, Body);
  return sendHomes(ctx, { leadIds: b.lead_ids, parcelKeys: b.parcel_keys, templateId: b.template_id, merge: b.merge, confirm: b.confirm });
});
