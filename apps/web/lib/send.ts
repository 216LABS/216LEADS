import "server-only";
import { createElement } from "react";
import { getDirectSql } from "@216leads/db";
import { appUrl, MailBatch, sendEmail } from "@216leads/email";
import { commitSend, mailFromEnv, planSend, SendBlockedError } from "@216leads/ingest";
import { ApiError, json } from "./api";
import { track } from "./events";
import type { Merge } from "./mail";
import type { OrgContext } from "./session";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

/**
 * The spec 10.3 send flow shared by POST /api/mail/send and the neighbor-ring mail route.
 * Without confirm it returns the cost preview and removal counts; with confirm it queues the
 * pieces with a 15-minute undo and emails the batch confirmation.
 */
export async function sendHomes(
  { org, user }: OrgContext,
  b: { leadIds: string[]; parcelKeys: string[]; templateId: string; merge?: Merge; confirm: boolean },
) {
  const sql = getDirectSql();
  // Another org's template or leads are a 404, like every cross-org id (issue #38).
  const [tpl] = await sql`select 1 from postcard_template where id = ${b.templateId} and (org_id is null or org_id = ${org.id})`;
  if (!tpl) throw new ApiError(404, "Template not found");
  const r = { orgId: org.id, leadIds: b.leadIds, parcelKeys: b.parcelKeys, templateId: b.templateId, merge: b.merge };
  const plan = await planSend(sql, r);
  if (!plan.requested) throw new ApiError(404, "None of these homes are in your account");
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
}
