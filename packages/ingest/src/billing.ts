// Stripe billing state (spec 11, issues #4 and #5). The web route verifies the webhook signature;
// everything that changes the database is here so it can be tested without Stripe.
import { createElement } from "react";
import type { Sql } from "@216leads/db";
import { optionalEnv } from "@216leads/db";
import { appUrl, PaymentFailed, sendEmail } from "@216leads/email";
import { deriveBillingState, PLANS, TRIAL, type BillingState } from "@216leads/shared";
import { releaseExclusiveLocks } from "./settings";

/** The subset of a Stripe event we read. */
export interface StripeEventLike {
  id: string;
  type: string;
  data: { object: Record<string, unknown> & { id?: string } };
}

type Interval = "month" | "year";
export type PaidPlan = keyof typeof PLANS;

/** Price id (from env) -> plan + interval. */
export function priceTable(): Map<string, { plan: PaidPlan; interval: Interval }> {
  const m = new Map<string, { plan: PaidPlan; interval: Interval }>();
  for (const plan of Object.keys(PLANS) as PaidPlan[]) {
    for (const [interval, suffix] of [["month", "MONTHLY"], ["year", "ANNUAL"]] as const) {
      const id = optionalEnv(`STRIPE_PRICE_${plan.toUpperCase()}_${suffix}`);
      if (id) m.set(id, { plan, interval });
    }
  }
  return m;
}

export function priceFor(plan: PaidPlan, interval: Interval): string | null {
  return optionalEnv(`STRIPE_PRICE_${plan.toUpperCase()}_${interval === "month" ? "MONTHLY" : "ANNUAL"}`) ?? null;
}

interface OrgBilling {
  id: string;
  plan: string;
  plan_status: string | null;
  trial_ends_at: Date | null;
  payment_failed_at: Date | null;
  period_end: Date | null;
  billing_state: BillingState;
}

/** Recompute and store billing_state for one org or all. Returns orgs whose state changed. */
export async function refreshBillingStates(sql: Sql, orgId?: string, now = new Date()): Promise<{ id: string; from: string; to: BillingState }[]> {
  const rows = await sql<OrgBilling[]>`
    select id, plan, plan_status, trial_ends_at, payment_failed_at, period_end, billing_state from org
    where ${orgId ?? null}::uuid is null or id = ${orgId ?? null}::uuid`;
  const changed: { id: string; from: string; to: BillingState }[] = [];
  for (const o of rows) {
    const to = deriveBillingState(o, now);
    if (to !== o.billing_state) {
      await sql`update org set billing_state = ${to} where id = ${o.id}`;
      changed.push({ id: o.id, from: o.billing_state, to });
    }
  }
  // Locking stops unsent postcards (issue #4). mail_piece rows exist from M8 on.
  const stopped = changed.filter((c) => c.to === "locked" || c.to === "canceled").map((c) => c.id);
  if (stopped.length) {
    await sql`update mail_piece set status = 'canceled' where org_id = any(${stopped}::uuid[]) and status = 'queued' and send_after > now()`;
  }
  return changed;
}

/**
 * Monthly postcard credits (spec 11): an active paid org gets its plan's credits once every
 * 30 days (credits don't roll over). Annual plans get them monthly too. The first grant adds to
 * what's there, so the 25 trial postcards survive subscribing. Returns orgs granted.
 */
export async function grantMonthlyCredits(sql: Sql, orgId?: string): Promise<number> {
  const due = await sql<{ id: string; plan: string; first: boolean }[]>`
    select o.id, o.plan, not exists (select 1 from usage_ledger u where u.org_id = o.id and u.kind = 'credit_grant') as first from org o
    where o.billing_state = 'active' and o.plan in ('starter', 'pro', 'exclusive')
      and (${orgId ?? null}::uuid is null or o.id = ${orgId ?? null}::uuid)
      and not exists (select 1 from usage_ledger u where u.org_id = o.id and u.kind = 'credit_grant' and u.created_at > now() - interval '30 days')`;
  for (const o of due) {
    const credits = PLANS[o.plan as PaidPlan].credits;
    await sql.begin(async (tx) => {
      await tx`update org set postcard_credits = case when ${o.first} then postcard_credits + ${credits} else ${credits} end where id = ${o.id}`;
      await tx`insert into usage_ledger (org_id, kind, qty) values (${o.id}, 'credit_grant', ${credits})`;
    });
  }
  return due.length;
}

/** One free trial per billing email (issue #4). False when this address already had one. */
export async function claimTrial(sql: Sql, email: string, orgId: string): Promise<boolean> {
  const r = await sql`insert into trial_claim (email, org_id) values (${email.toLowerCase()}, ${orgId}) on conflict do nothing returning email`;
  return r.length > 0;
}

const str = (v: unknown) => (typeof v === "string" ? v : null);
const idOf = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" && "id" in v ? str((v as { id: unknown }).id) : null);

async function orgFor(sql: Sql, obj: Record<string, unknown>): Promise<string | null> {
  const meta = (obj.metadata ?? {}) as Record<string, string>;
  const fromMeta = meta.org_id ?? str(obj.client_reference_id);
  if (fromMeta && /^[0-9a-f-]{36}$/i.test(fromMeta)) {
    const [o] = await sql<{ id: string }[]>`select id from org where id = ${fromMeta}`;
    if (o) return o.id;
  }
  const customer = idOf(obj.customer);
  if (!customer) return null;
  const [o] = await sql<{ id: string }[]>`select id from org where stripe_customer_id = ${customer}`;
  return o?.id ?? null;
}

/**
 * Apply one verified Stripe event. Idempotent on event.id (spec 11 webhooks; issue #4).
 * Returns what happened, for the log and tests.
 */
export async function applyStripeEvent(sql: Sql, ev: StripeEventLike): Promise<string> {
  const obj = ev.data.object;
  const orgId = await orgFor(sql, obj);
  const [fresh] = await sql`insert into stripe_event (id, type, org_id) values (${ev.id}, ${ev.type}, ${orgId}) on conflict do nothing returning id`;
  if (!fresh) return "duplicate";
  if (!orgId) return "no_org";

  switch (ev.type) {
    case "checkout.session.completed": {
      const meta = (obj.metadata ?? {}) as Record<string, string>;
      await sql`
        update org set stripe_customer_id = coalesce(${idOf(obj.customer)}, stripe_customer_id),
          stripe_subscription_id = coalesce(${idOf(obj.subscription)}, stripe_subscription_id),
          founding_member = founding_member or ${meta.founding === "1"}
        where id = ${orgId}`;
      // Spec 11: 25 free postcards when a trial adds a card, once.
      if (meta.during_trial === "1") {
        const [had] = await sql`select 1 from usage_ledger where org_id = ${orgId} and kind = 'trial_credit_grant'`;
        if (!had) {
          await sql`update org set postcard_credits = postcard_credits + ${TRIAL.cardCredits} where id = ${orgId}`;
          await sql`insert into usage_ledger (org_id, kind, qty) values (${orgId}, 'trial_credit_grant', ${TRIAL.cardCredits})`;
        }
      }
      return "checkout";
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const items = ((obj.items as { data?: { price?: { id?: string }; current_period_end?: number }[] })?.data ?? []);
      const prices = priceTable();
      const paid = items.map((i) => prices.get(i.price?.id ?? "")).find(Boolean);
      const status = ev.type === "customer.subscription.deleted" ? "canceled" : str(obj.status);
      const periodEnd = items.map((i) => i.current_period_end).find((x) => typeof x === "number");
      const cancel = obj.cancellation_details as { feedback?: string | null; reason?: string | null } | null;
      const plan = status === "canceled" ? "canceled" : paid?.plan ?? null;
      await sql`
        update org set
          plan = coalesce(${plan}, plan),
          plan_status = ${status},
          plan_interval = coalesce(${paid?.interval ?? null}, plan_interval),
          stripe_subscription_id = ${str(obj.id)},
          stripe_customer_id = coalesce(${idOf(obj.customer)}, stripe_customer_id),
          period_end = ${periodEnd ? new Date(periodEnd * 1000) : null},
          cancel_reason = coalesce(${cancel?.feedback ?? cancel?.reason ?? null}, cancel_reason),
          payment_failed_at = case when ${status} in ('active', 'trialing') then null else payment_failed_at end
        where id = ${orgId}`;
      // Exclusive ZIPs are an Exclusive-plan feature: leaving the plan frees them for others.
      if (plan && plan !== "exclusive") await releaseExclusiveLocks(sql, orgId);
      await refreshBillingStates(sql, orgId);
      await grantMonthlyCredits(sql, orgId);
      return `subscription:${status}`;
    }
    case "invoice.paid": {
      await sql`
        update org set payment_failed_at = null,
          plan_status = case when plan_status in ('past_due', 'unpaid') then 'active' else plan_status end
        where id = ${orgId}`;
      await refreshBillingStates(sql, orgId);
      await grantMonthlyCredits(sql, orgId);
      return "paid";
    }
    case "invoice.payment_failed": {
      await sql`update org set payment_failed_at = coalesce(payment_failed_at, now()), plan_status = 'past_due' where id = ${orgId}`;
      await refreshBillingStates(sql, orgId);
      const [org] = await sql<{ name: string }[]>`select name from org where id = ${orgId}`;
      const owners = await sql<{ email: string }[]>`
        select u.email::text from org_member m join auth.users u on u.id = m.user_id where m.org_id = ${orgId} and m.role = 'owner'`;
      await sendEmail(sql, {
        orgId, kind: "payment_failed", dedupeKey: `payment_failed:${str(obj.id) ?? ev.id}`, to: owners.map((o) => o.email),
        subject: "We couldn't charge your card", element: createElement(PaymentFailed, { orgName: org!.name, billingUrl: appUrl("/settings/billing") }),
      });
      return "payment_failed";
    }
    default:
      return "ignored";
  }
}
