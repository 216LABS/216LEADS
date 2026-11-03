// POST /api/webhooks/stripe (spec 11): signature-checked, idempotent on event.id. The database work
// is applyStripeEvent in @216leads/ingest.
import { getSql } from "@216leads/db";
import { applyStripeEvent, type StripeEventLike } from "@216leads/ingest";
import { track } from "@/lib/events";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return new Response("billing not configured", { status: 503 });
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event;
  try {
    event = s.webhooks.constructEvent(raw, sig ?? "", secret);
  } catch {
    return new Response("bad signature", { status: 400 });
  }
  const result = await applyStripeEvent(getSql(), event as unknown as StripeEventLike);
  if (result === "subscription:active") {
    const meta = (event.data.object as { metadata?: Record<string, string> }).metadata ?? {};
    await track("subscribed", { orgId: meta.org_id ?? null }, { event: event.type });
  }
  return Response.json({ received: true, result });
}
