import "server-only";
// Stripe client (spec 11, decision 11): test keys only outside production; no key = billing off.
import Stripe from "stripe";
import { assertKeyAllowed } from "@216leads/shared";

let client: Stripe | null | undefined;

export function stripe(): Stripe | null {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return (client = null);
  assertKeyAllowed("stripe", key);
  return (client = new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 }));
}

export const FOUNDING_SPOTS = 20;
let founding: { at: number; left: number } | null = null;

/**
 * Founding offer spots left (issue #5): max_redemptions minus times_redeemed of the coupon in
 * STRIPE_FOUNDING_COUPON_ID, cached 5 minutes. 0 when the coupon is missing, invalid or used up.
 */
export async function foundingSpotsLeft(): Promise<number> {
  if (founding && Date.now() - founding.at < 5 * 60_000) return founding.left;
  const id = process.env.STRIPE_FOUNDING_COUPON_ID;
  const s = stripe();
  let left = 0;
  if (id && s) {
    try {
      const c = await s.coupons.retrieve(id);
      left = c.valid ? Math.max(0, (c.max_redemptions ?? FOUNDING_SPOTS) - c.times_redeemed) : 0;
    } catch (e) {
      console.error("founding coupon lookup failed", e instanceof Error ? e.message : e);
    }
  }
  founding = { at: Date.now(), left };
  return left;
}
