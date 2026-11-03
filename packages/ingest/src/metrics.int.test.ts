// Issue #10: business metrics and the at-risk list against the seeded DB. Metrics are global, so
// the test adds known fixtures and checks the change they make, worked out by hand below.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAll, getDirectSql } from "@216leads/db";
import { atRiskOrgs, businessMetrics, orgMrr, snapshotMetrics, type BusinessMetrics } from "./metrics";

const sql = getDirectSql();
const orgs: string[] = [];
const users: string[] = [];
let before: BusinessMetrics;
const ids: Record<string, string> = {};

async function org(name: string, f: { plan: string; billing: string; interval?: string; founding?: boolean; trialEndsDaysAgo?: number; canceledDaysAgo?: number; lastSeenDaysAgo?: number }) {
  const user = randomUUID();
  users.push(user);
  await sql`insert into auth.users (id, email) values (${user}, ${`metrics-${user.slice(0, 8)}@int.test`})`;
  const [o] = await sql<{ id: string }[]>`
    insert into org (name, trade, onboarded_at, plan, plan_interval, billing_state, founding_member, trial_ends_at, canceled_at, last_seen_at, created_at)
    values (${name}, 'roofing', now() - interval '60 days', ${f.plan}, ${f.interval ?? null}, ${f.billing}, ${f.founding ?? false},
      ${f.trialEndsDaysAgo === undefined ? null : sql`now() - make_interval(days => ${f.trialEndsDaysAgo})`},
      ${f.canceledDaysAgo === undefined ? null : sql`now() - make_interval(days => ${f.canceledDaysAgo})`},
      ${f.lastSeenDaysAgo === undefined ? null : sql`now() - make_interval(days => ${f.lastSeenDaysAgo})`},
      now() - interval '60 days')
    returning id`;
  await sql`insert into org_member (org_id, user_id, role) values (${o!.id}, ${user}, 'owner')`;
  orgs.push(o!.id);
  ids[name] = o!.id;
  return o!.id;
}

beforeAll(async () => {
  before = await businessMetrics(sql);
  const founding = await org("Founding Pro", { plan: "pro", billing: "active", interval: "month", founding: true, trialEndsDaysAgo: 10, lastSeenDaysAgo: 1 });
  await org("Starter Monthly", { plan: "starter", billing: "active", interval: "month", trialEndsDaysAgo: 10, lastSeenDaysAgo: 15 });
  await org("Exclusive Yearly", { plan: "exclusive", billing: "past_due", interval: "year", trialEndsDaysAgo: 10, lastSeenDaysAgo: 2 });
  await org("Trial One", { plan: "trial", billing: "trialing", trialEndsDaysAgo: -5, lastSeenDaysAgo: 30 });
  await org("Trial Two", { plan: "trial", billing: "trialing", trialEndsDaysAgo: -9 });
  await org("Canceled Pro", { plan: "canceled", billing: "canceled", trialEndsDaysAgo: 40, canceledDaysAgo: 5 });
  const [p] = await sql<{ parcel_key: string }[]>`select parcel_key from parcel limit 1`;
  for (let i = 0; i < 2; i++) {
    await sql`insert into mail_piece (org_id, parcel_key, provider, to_address, status, price_cents, cost_cents)
      values (${founding}, ${p!.parcel_key}, 'dryrun', '{"line1":"1 Test St"}', 'submitted', 99, 70)`;
  }
});

afterAll(async () => {
  await sql`delete from metrics_daily where date = (now() at time zone 'America/New_York')::date`;
  await sql`delete from org where id = any(${orgs}::uuid[])`;
  await sql`delete from auth.users where id = any(${users}::uuid[])`;
  await closeAll();
});

describe("business metrics (issue #10)", () => {
  it("prices each org's subscription", () => {
    expect(orgMrr({ plan: "pro", plan_interval: "month", founding_member: true })).toBe(149);
    expect(orgMrr({ plan: "pro", plan_interval: "month", founding_member: false })).toBe(199);
    expect(orgMrr({ plan: "exclusive", plan_interval: "year", founding_member: false })).toBeCloseTo(3490 / 12, 5);
    expect(orgMrr({ plan: "trial", plan_interval: null, founding_member: false })).toBe(0);
  });

  it("adds the fixtures' numbers on top of what was there", async () => {
    const m = await businessMetrics(sql);
    // MRR: founding Pro 149 + Starter 99 + Exclusive yearly 3490/12 (past due still pays).
    expect(m.mrr - before.mrr).toBeCloseTo(149 + 99 + 3490 / 12, 1);
    expect(m.payingOrgs - before.payingOrgs).toBe(3);
    expect(m.plans.starter - before.plans.starter).toBe(1);
    expect(m.plans.pro - before.plans.pro).toBe(1);
    expect(m.plans.exclusive - before.plans.exclusive).toBe(1);
    expect(m.trials - before.trials).toBe(2);
    expect(m.foundingUsed - before.foundingUsed).toBe(1);
    expect(m.postcardsThisMonth - before.postcardsThisMonth).toBe(2);
    expect(m.postcardRevenue - before.postcardRevenue).toBeCloseTo(1.98, 2);
    expect(m.postcardCost - before.postcardCost).toBeCloseTo(1.4, 2);
    // Rates, checked against independent counts.
    const [c] = await sql<{ t30: number; p30: number; churned: number }[]>`
      select (select count(*) from org where trial_ends_at >= now() - interval '30 days' and trial_ends_at <= now())::int as t30,
        (select count(*) from org where trial_ends_at >= now() - interval '30 days' and trial_ends_at <= now() and plan <> 'trial' and plan <> 'canceled')::int as p30,
        (select count(*) from org where canceled_at >= now() - interval '30 days')::int as churned`;
    expect(m.trialToPaid30).toBe(Math.round((c!.p30 / c!.t30) * 1000) / 10);
    expect(m.churn30).toBe(Math.round((c!.churned / (m.payingOrgs + c!.churned)) * 1000) / 10);
  });

  it("lists at-risk paying orgs with the reason; trials and active users are left off", async () => {
    const rows = await atRiskOrgs(sql);
    const by = new Map(rows.map((r) => [r.org_id, r]));
    expect(by.get(ids["Starter Monthly"]!)?.reason).toMatch(/No login or lead updates in 14\+ days/);
    expect(by.get(ids["Exclusive Yearly"]!)?.reason).toBe("Payment past due");
    expect(by.has(ids["Founding Pro"]!)).toBe(false);
    expect(by.has(ids["Trial One"]!)).toBe(false);
    expect(by.get(ids["Starter Monthly"]!)?.owner_email).toMatch(/@int\.test$/);
  });

  it("flags three unopened digests in a row only when open tracking is on", async () => {
    const id = ids["Founding Pro"]!;
    for (let w = 1; w <= 3; w++) {
      await sql`insert into email_log (org_id, kind, dedupe_key, to_emails, via, sent_at)
        values (${id}, 'digest', ${`metrics-digest-${id}-${w}`}, '{a@int.test}', 'outbox', now() - make_interval(days => ${w * 7}))`;
    }
    expect((await atRiskOrgs(sql)).some((r) => r.org_id === id)).toBe(false);
    const on = await atRiskOrgs(sql, { inactiveDays: 14, unopenedWeeks: 3 }, { openTracking: true });
    expect(on.find((r) => r.org_id === id)?.reason).toBe("Digest unopened 3 weeks in a row");
    await sql`update email_log set opened_at = now() where dedupe_key = ${`metrics-digest-${id}-2`}`;
    expect((await atRiskOrgs(sql, { inactiveDays: 14, unopenedWeeks: 3 }, { openTracking: true })).some((r) => r.org_id === id)).toBe(false);
  });

  it("snapshots today's numbers once per day", async () => {
    const m = await snapshotMetrics(sql);
    await snapshotMetrics(sql);
    const rows = await sql<{ key: string; value: number }[]>`
      select key, value::float8 as value from metrics_daily where date = (now() at time zone 'America/New_York')::date and key in ('mrr', 'paying_orgs')`;
    expect(Object.fromEntries(rows.map((r) => [r.key, r.value]))).toEqual({ mrr: m.mrr, paying_orgs: m.payingOrgs });
  });
});
