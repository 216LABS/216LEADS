// POST /api/mail/send (spec 8, 10.3): lead_ids[] (or parcel keys from the map) + template_id.
// Without confirm it returns the cost preview and removal counts; with confirm=true it queues
// the pieces with a 15-minute undo and emails the batch confirmation.
import { createElement } from "react";
import { z } from "zod";
import { getDirectSql } from "@216leads/db";
import { appUrl, MailBatch, sendEmail } from "@216leads/email";
import { commitSend, mailFromEnv, planSend, SendBlockedError } from "@216leads/ingest";
import { ApiError, apiActiveOrg, body, handle, json } from "@/lib/api";
import { track } from "@/lib/events";
import { MergeSchema } from "@/lib/mail";

const Body = z.object({
  lead_ids: z.array(z.string().uuid()).max(500).default([]),
  parcel_keys: z.array(z.string().max(60)).max(500).default([]),
  template_id: z.string().uuid(),
  merge: MergeSchema.optional(),
  confirm: z.boolean().default(false),
}).refine((b) => b.lead_ids.length + b.parcel_keys.length > 0, "Pick at least one home");

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export const POST = handle(async (req: Request) => {
  const { org, user } = await apiActiveOrg();
  const b = await body(req, Body);
  const sql = getDirectSql();
  const r = { orgId: org.id, leadIds: b.lead_ids, parcelKeys: b.parcel_keys, templateId: b.template_id, merge: b.merge };
  const plan = await planSend(sql, r);
  const preview = { requested: plan.requested, sending: plan.pieces.length, removed: plan.removed, credits: plan.credits, metered: plan.metered,
    cost_cents: plan.costCents, delivery: plan.deliveryWindow };
  if (!b.confirm) return json(preview);
  if (!plan.pieces.length) throw new ApiError(422, "None of these homes can be mailed right now.");
  let res;
  try {
    res = await commitSend(sql, r, plan, mailFromEnv());
  } catch (e) {
    if (e instanceof SendBlockedError) throw new ApiError(422, e.message);
    throw e;
  }
  await track("postcard_queued", { orgId: org.id, userId: user.id }, { pieces: res.queued, failed: res.failed, metered: plan.metered });
  const removed = Object.values(plan.removed).reduce((a, n) => a + n, 0);
  await sendEmail(sql, {
    orgId: org.id, kind: "mail_batch", dedupeKey: `mail_batch:${res.batchId}`, to: [user.email],
    subject: `${res.queued} postcard${res.queued === 1 ? "" : "s"} queued`,
    element: createElement(MailBatch, {
      count: res.queued, removed, costText: plan.costCents ? `${plan.credits} credits + ${money(plan.costCents)}` : `${plan.credits} credits`,
      cancelBy: res.sendAfter.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }), mailUrl: appUrl("/mail"),
    }),
  }).catch((e) => console.error("batch email failed", e));
  return json({ ...preview, batch_id: res.batchId, queued: res.queued, failed: res.failed, cancel_until: res.sendAfter.toISOString() });
});
