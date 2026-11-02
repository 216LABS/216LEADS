import { describe, expect, it } from "vitest";
import { canUseApp, deriveBillingState, type BillingFacts } from "./billing";

const now = new Date("2026-11-15T12:00:00Z");
const day = 86_400_000;
const at = (d: number) => new Date(now.getTime() + d * day);
const base: BillingFacts = { plan: "trial", plan_status: null, trial_ends_at: at(3), payment_failed_at: null, period_end: null };

describe("deriveBillingState (issue #4)", () => {
  it("trial: trialing until trial_ends_at, then locked", () => {
    expect(deriveBillingState(base, now)).toBe("trialing");
    expect(deriveBillingState({ ...base, trial_ends_at: at(-0.01) }, now)).toBe("locked");
    expect(deriveBillingState({ ...base, trial_ends_at: null }, now)).toBe("locked");
  });

  it("subscribed: active, including Stripe's own trialing and an unfinished Checkout during the trial", () => {
    expect(deriveBillingState({ ...base, plan: "pro", plan_status: "active" }, now)).toBe("active");
    expect(deriveBillingState({ ...base, plan: "pro", plan_status: "trialing" }, now)).toBe("active");
    expect(deriveBillingState({ ...base, plan_status: "incomplete" }, now)).toBe("trialing");
  });

  it("payment failed: past_due for 7 days of grace, then locked; paying returns to active", () => {
    const pd = { ...base, plan: "pro", plan_status: "past_due" };
    expect(deriveBillingState({ ...pd, payment_failed_at: at(-6.9) }, now)).toBe("past_due");
    expect(deriveBillingState({ ...pd, payment_failed_at: at(-7) }, now)).toBe("locked");
    expect(deriveBillingState({ ...pd, plan_status: "unpaid", payment_failed_at: at(-10) }, now)).toBe("locked");
    expect(deriveBillingState({ ...pd, plan_status: "active", payment_failed_at: null }, now)).toBe("active");
  });

  it("canceled: full access until the period ends, then canceled", () => {
    const c = { ...base, plan: "canceled", plan_status: "canceled" };
    expect(deriveBillingState({ ...c, period_end: at(5) }, now)).toBe("active");
    expect(deriveBillingState({ ...c, period_end: at(-1) }, now)).toBe("canceled");
    expect(deriveBillingState({ ...c, plan_status: null }, now)).toBe("canceled");
  });

  it("only locked and canceled stop the app", () => {
    expect(["trialing", "active", "past_due", "locked", "canceled"].map((s) => canUseApp(s as never))).toEqual([true, true, true, false, false]);
  });
});
