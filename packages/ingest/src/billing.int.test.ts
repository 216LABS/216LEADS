// Billing end to end without Stripe (spec 11, issues #4 and #5): synthetic webhook events walk an
// org from trial through subscribed, payment failed, grace, locked, paid, and canceled.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAll, getDirectSql } from "@216leads/db";
import { answersSchema, getTemplate } from "@216leads/scoring";
import { applyStripeEvent, grantMonthlyCredits, refreshBillingStates } from "./billing";
import { createOrgFromWizard } from "./profile";

process.env.STRIPE_PRICE_PRO_MONTHLY = "price_test_pro_m";
process.env.STRIPE_PRICE_STARTER_ANNUAL = "price_test_starter_y";

const sql = getDirectSql();
const user = crypto.randomUUID();
const email = `bill-${user}@int.test`;
let orgId = "";
let n = 0;
const ev = (type: string, object: Record<string, unknown>) => ({ id: `evt_test_${user}_${++n}`, type, data: { object } });
const org = async () => (await sql<{ plan: string; plan_status: string | null; billing_state: string; postcard_credits: number; founding_member: boolean;
  stripe_customer_id: string | null; plan_interval: string | null; cancel_reason: string | null }[]>`
  select plan, plan_status, billing_state, postcard_credits, founding_member, stripe_customer_id, plan_interval, cancel_reason from org where id = ${orgId}`)[0]!;
const future = Math.floor(Date.now() / 1000) + 20 * 86400;
const sub = (status: string, price = "price_test_pro_m", extra: Record<string, unknown> = {}) => ({
  id: "sub_test_1", customer: "cus_test_1", status, metadata: { org_id: orgId },
  items: { data: [{ price: { id: price }, current_period_end: future }] }, ...extra,
});

beforeAll(async () => {
  await sql`insert into auth.users (id, email) values (${user}, ${email})`;
  const answers = answersSchema.parse({ business_name: "Billing Co", sells: "Roofing", job_value: "2k_10k", zips: ["44107"], preset: "roofing" });
  orgId = await createOrgFromWizard(sql, { userId: user, email, answers, recipe: { ...getTemplate("roofing"), preset_base: "roofing" } });
});

afterAll(async () => {
  await sql`delete from org where name in ('Billing Co', 'Billing Co Again')`;
  await sql`delete from trial_claim where email = ${email}`;
  await sql`delete from auth.users where id = ${user}`;
  await closeAll();
});

describe("billing lifecycle", () => {
  it("starts on the trial", async () => {
    expect((await org()).billing_state).toBe("trialing");
  });

  it("checkout during the trial: customer saved, founding flag, 25 postcards once", async () => {
    const done = ev("checkout.session.completed", {
      id: "cs_1", customer: "cus_test_1", subscription: "sub_test_1", client_reference_id: orgId,
      metadata: { org_id: orgId, founding: "1", during_trial: "1" },
    });
    expect(await applyStripeEvent(sql, done)).toBe("checkout");
    expect(await applyStripeEvent(sql, done)).toBe("duplicate"); // Stripe retry
    await applyStripeEvent(sql, ev("checkout.session.completed", { customer: "cus_test_1", metadata: { org_id: orgId, during_trial: "1" } }));
    const o = await org();
    expect(o).toMatchObject({ stripe_customer_id: "cus_test_1", founding_member: true, postcard_credits: 25 });
  });

  it("subscription active: Pro, active, first month's credits added to the trial ones", async () => {
    expect(await applyStripeEvent(sql, ev("customer.subscription.created", sub("active")))).toBe("subscription:active");
    expect(await org()).toMatchObject({ plan: "pro", plan_interval: "month", billing_state: "active", postcard_credits: 75 });
    expect(await grantMonthlyCredits(sql, orgId)).toBe(0); // not again within 30 days
  });

  it("payment failed: past_due with a banner, owner emailed, locked after 7 days, paying unlocks", async () => {
    expect(await applyStripeEvent(sql, ev("invoice.payment_failed", { id: "in_1", customer: "cus_test_1" }))).toBe("payment_failed");
    expect((await org()).billing_state).toBe("past_due");
    const [mail] = await sql<{ to_emails: string[] }[]>`select to_emails from email_log where org_id = ${orgId} and kind = 'payment_failed'`;
    expect(mail!.to_emails).toEqual([email]);
    await sql`update org set payment_failed_at = now() - interval '8 days' where id = ${orgId}`;
    expect(await refreshBillingStates(sql, orgId)).toEqual([{ id: orgId, from: "past_due", to: "locked" }]);
    await applyStripeEvent(sql, ev("invoice.paid", { id: "in_1", customer: "cus_test_1" }));
    expect((await org()).billing_state).toBe("active");
  });

  it("canceled at period end: works until then, then canceled; the reason is kept", async () => {
    await applyStripeEvent(sql, ev("customer.subscription.updated", sub("active", "price_test_pro_m", { cancel_at_period_end: true, cancellation_details: { feedback: "too_expensive" } })));
    expect(await org()).toMatchObject({ billing_state: "active", cancel_reason: "too_expensive" });
    await applyStripeEvent(sql, ev("customer.subscription.deleted", { ...sub("canceled"), items: { data: [{ price: { id: "price_test_pro_m" }, current_period_end: Math.floor(Date.now() / 1000) - 60 }] } }));
    expect(await org()).toMatchObject({ plan: "canceled", billing_state: "canceled" });
  });

  it("re-subscribing from canceled restores access with no new trial", async () => {
    await applyStripeEvent(sql, ev("customer.subscription.created", { ...sub("active", "price_test_starter_y"), id: "sub_test_2" }));
    expect(await org()).toMatchObject({ plan: "starter", plan_interval: "year", billing_state: "active" });
  });

  it("one trial per email: a second org for the same address starts locked", async () => {
    const answers = answersSchema.parse({ business_name: "Billing Co Again", sells: "Roofing", job_value: "2k_10k", zips: ["44107"], preset: "roofing" });
    const again = await createOrgFromWizard(sql, { userId: user, email: email.toUpperCase(), answers, recipe: { ...getTemplate("roofing"), preset_base: "roofing" } });
    const [o] = await sql<{ billing_state: string }[]>`select billing_state from org where id = ${again}`;
    expect(o!.billing_state).toBe("locked");
  });

  it("ignores events for unknown customers", async () => {
    expect(await applyStripeEvent(sql, ev("invoice.paid", { customer: "cus_nobody" }))).toBe("no_org");
  });
});
