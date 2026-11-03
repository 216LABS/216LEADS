// POST /api/webhooks/resend: signature-checked Resend events. email.opened marks the email_log row
// opened, which the "digest unopened" at-risk rule reads (issue #10). Other events are ignored.
import { getDirectSql } from "@216leads/db";
import { verifyResendWebhook } from "@216leads/email";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response("open tracking not configured", { status: 503 });
  const raw = await req.text();
  const ok = verifyResendWebhook(raw, {
    id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature"),
  }, secret);
  if (!ok) return new Response("bad signature", { status: 400 });
  const ev = JSON.parse(raw) as { type?: string; data?: { email_id?: string } };
  if (ev.type === "email.opened" && ev.data?.email_id) {
    await getDirectSql()`update email_log set opened_at = coalesce(opened_at, now()) where ref = ${ev.data.email_id}`;
  }
  return Response.json({ received: true });
}
