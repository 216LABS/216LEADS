// POST /api/billing/portal (spec 11): Stripe Customer Portal to change plan, card or cancel.
import { ApiError, apiOrg, handle, json } from "@/lib/api";
import { stripe } from "@/lib/stripe";
import { appOrigin } from "@/lib/urls";

export const POST = handle(async (req: Request) => {
  const { org, role } = await apiOrg();
  if (role !== "owner") throw new ApiError(403, "Only the account owner can manage billing");
  const s = stripe();
  if (!s) throw new ApiError(503, "Billing isn't set up yet.");
  if (!org.stripe_customer_id) throw new ApiError(409, "Pick a plan first.");
  const session = await s.billingPortal.sessions.create({ customer: org.stripe_customer_id, return_url: `${appOrigin(req)}/settings/billing` });
  return json({ url: session.url });
});
