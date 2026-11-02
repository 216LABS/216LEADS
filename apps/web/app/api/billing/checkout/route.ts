// POST /api/billing/checkout (spec 11): Stripe Checkout for a plan. Keeps any trial days left,
// adds the metered postcard price, and applies the founding coupon to Pro monthly while spots
// remain (issue #5). Owner only.
import { z } from "zod";
import { getDirectSql } from "@216leads/db";
import { priceFor } from "@216leads/ingest";
import { ApiError, apiOrg, body, handle, json } from "@/lib/api";
import { track } from "@/lib/events";
import { foundingSpotsLeft, stripe } from "@/lib/stripe";
import { appOrigin } from "@/lib/urls";

const Body = z.object({ plan: z.enum(["starter", "pro", "exclusive"]), interval: z.enum(["month", "year"]).default("month") });

export const POST = handle(async (req: Request) => {
  const { org, user, role } = await apiOrg();
  if (role !== "owner") throw new ApiError(403, "Only the account owner can change the plan");
  const { plan, interval } = await body(req, Body);
  const s = stripe();
  const price = priceFor(plan, interval);
  if (!s || !price) throw new ApiError(503, "Billing isn't set up yet. Your trial keeps running; we'll email you when plans open.");

  let customer = org.stripe_customer_id;
  if (!customer) {
    customer = (await s.customers.create({ email: user.email, name: org.name, metadata: { org_id: org.id } })).id;
    await getDirectSql()`update org set stripe_customer_id = ${customer} where id = ${org.id}`;
  }
  const founding = plan === "pro" && interval === "month" && process.env.STRIPE_FOUNDING_COUPON_ID && (await foundingSpotsLeft()) > 0;
  const trialEnd = org.trial_ends_at ? Math.floor(Date.parse(org.trial_ends_at) / 1000) : 0;
  // Stripe needs a trial end at least 48 hours out; shorter remainders start billing now.
  const keepTrial = org.billing_state === "trialing" && trialEnd > Date.now() / 1000 + 49 * 3600;
  const metered = process.env.STRIPE_PRICE_POSTCARD_METERED;
  const origin = appOrigin(req);

  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: org.id,
    line_items: [{ price, quantity: 1 }, ...(metered ? [{ price: metered }] : [])],
    discounts: founding ? [{ coupon: process.env.STRIPE_FOUNDING_COUPON_ID! }] : undefined,
    subscription_data: { metadata: { org_id: org.id }, ...(keepTrial ? { trial_end: trialEnd } : {}) },
    metadata: { org_id: org.id, plan, interval, founding: founding ? "1" : "0", during_trial: org.billing_state === "trialing" ? "1" : "0" },
    success_url: `${origin}/settings/billing?done=1`,
    cancel_url: `${origin}/settings/billing`,
  });
  await track("checkout_started", { orgId: org.id, userId: user.id }, { plan, interval, founding: !!founding });
  return json({ url: session.url });
});
