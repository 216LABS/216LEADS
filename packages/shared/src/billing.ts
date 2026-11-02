// Billing state (spec 11, issue #4): one pure function decides what an org may do.

export type BillingState = "trialing" | "active" | "past_due" | "locked" | "canceled";

export interface BillingFacts {
  /** trial | starter | pro | exclusive | canceled */
  plan: string;
  /** Stripe subscription status, null when there has never been a subscription. */
  plan_status: string | null;
  trial_ends_at: string | Date | null;
  payment_failed_at: string | Date | null;
  /** End of the paid period (a canceled plan works until then). */
  period_end: string | Date | null;
}

export const GRACE_DAYS = 7;

const t = (v: string | Date | null) => (v === null ? null : new Date(v).getTime());

export function deriveBillingState(f: BillingFacts, now: Date = new Date()): BillingState {
  const n = now.getTime();
  const trialEnd = t(f.trial_ends_at);
  const periodEnd = t(f.period_end);
  switch (f.plan_status) {
    case "active":
    case "trialing": // Stripe "trialing" = subscribed with a card, still in the free days
      return "active";
    case "past_due":
    case "unpaid": {
      const failed = t(f.payment_failed_at) ?? n;
      return n - failed < GRACE_DAYS * 86_400_000 ? "past_due" : "locked";
    }
    case "canceled":
    case "incomplete_expired":
      return periodEnd !== null && periodEnd > n ? "active" : "canceled";
    default:
      // No subscription yet (or Checkout not finished): the free trial decides.
      if (f.plan === "canceled") return "canceled";
      return trialEnd !== null && trialEnd > n ? "trialing" : "locked";
  }
}

/** States in which the paid features run (leads, export, digests, mail). */
export const canUseApp = (s: BillingState) => s === "trialing" || s === "active" || s === "past_due";
