// Admin business metrics and at-risk accounts (issue #10). Everything is computed from our own
// tables (org billing facts, mail_piece, events), so the page works without opening Stripe.
import type { Sql } from "@216leads/db";
import { FOUNDING_PRO_MONTHLY, FOUNDING_SPOTS, PLANS, TZ, todayEt, type PlanKey } from "@216leads/shared";
import { withJobRun } from "./runtime";

type Paid = Exclude<PlanKey, "trial" | "canceled">;
const PAID = ["starter", "pro", "exclusive"] as const;

export interface AtRiskConfig {
  /** No login and no lead status change for this many days. */
  inactiveDays: number;
  /** Digest unopened this many weeks in a row (needs open tracking). */
  unopenedWeeks: number;
}
export const AT_RISK_DEFAULTS: AtRiskConfig = { inactiveDays: 14, unopenedWeeks: 3 };

export async function adminSetting<T>(sql: Sql, key: string, fallback: T): Promise<T> {
  const [r] = await sql<{ value: T }[]>`select value from admin_setting where key = ${key}`;
  return r ? { ...(fallback as object), ...(r.value as object) } as T : fallback;
}

export async function setAdminSetting(sql: Sql, key: string, value: unknown) {
  await sql`insert into admin_setting (key, value) values (${key}, ${sql.json(value as never)})
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

/** Monthly recurring revenue in dollars for one org: plan price, annual / 12, founding Pro at its price. */
export function orgMrr(o: { plan: string; plan_interval: string | null; founding_member: boolean }): number {
  if (!(PAID as readonly string[]).includes(o.plan)) return 0;
  const p = PLANS[o.plan as Paid];
  if (o.plan === "pro" && o.founding_member && o.plan_interval !== "year") return FOUNDING_PRO_MONTHLY;
  return o.plan_interval === "year" ? p.annual / 12 : p.monthly;
}

export interface BusinessMetrics {
  date: string;
  mrr: number;
  plans: Record<Paid, number>;
  payingOrgs: number;
  activeOrgs: number;
  foundingUsed: number;
  foundingSpots: number;
  trials: number;
  trialToPaid30: number | null;
  trialToPaid90: number | null;
  churn30: number | null;
  postcardsThisMonth: number;
  postcardRevenue: number;
  postcardCost: number;
  monthlyCost: number | null;
  costPerCustomer: number | null;
}

const rate = (num: number, den: number) => (den ? Math.round((num / den) * 1000) / 10 : null);

export async function businessMetrics(sql: Sql, now = new Date()): Promise<BusinessMetrics> {
  const orgs = await sql<{ plan: string; plan_interval: string | null; founding_member: boolean; billing_state: string }[]>`
    select plan, plan_interval, founding_member, billing_state from org where onboarded_at is not null`;
  // Paying = a paid plan that isn't canceled or locked (past_due still counts until it locks).
  const paying = orgs.filter((o) => (PAID as readonly string[]).includes(o.plan) && (o.billing_state === "active" || o.billing_state === "past_due"));
  const plans = { starter: 0, pro: 0, exclusive: 0 } as Record<Paid, number>;
  for (const o of paying) plans[o.plan as Paid]++;
  const [t] = await sql<{ t30: number; p30: number; t90: number; p90: number; churned: number; founding: number; trials: number }[]>`
    select
      count(*) filter (where trial_ends_at between ${now}::timestamptz - interval '30 days' and ${now}::timestamptz)::int as t30,
      count(*) filter (where trial_ends_at between ${now}::timestamptz - interval '30 days' and ${now}::timestamptz and plan in ('starter', 'pro', 'exclusive'))::int as p30,
      count(*) filter (where trial_ends_at between ${now}::timestamptz - interval '90 days' and ${now}::timestamptz)::int as t90,
      count(*) filter (where trial_ends_at between ${now}::timestamptz - interval '90 days' and ${now}::timestamptz and plan in ('starter', 'pro', 'exclusive'))::int as p90,
      count(*) filter (where canceled_at between ${now}::timestamptz - interval '30 days' and ${now}::timestamptz)::int as churned,
      count(*) filter (where founding_member)::int as founding,
      count(*) filter (where billing_state = 'trialing' and onboarded_at is not null)::int as trials
    from org`;
  const [m] = await sql<{ pieces: number; price: number; cost: number }[]>`
    select count(*)::int as pieces, coalesce(sum(price_cents), 0)::int as price, coalesce(sum(cost_cents), 0)::int as cost
    from mail_piece where status not in ('canceled', 'failed')
      and date_trunc('month', created_at at time zone ${TZ}) = date_trunc('month', ${now}::timestamptz at time zone ${TZ})`;
  const cost = await adminSetting<{ monthly_cost_cents: number | null }>(sql, "monthly_cost", { monthly_cost_cents: null });
  const monthlyCost = cost.monthly_cost_cents === null ? null : cost.monthly_cost_cents / 100;
  const mrr = Math.round(paying.reduce((s, o) => s + orgMrr(o), 0) * 100) / 100;
  return {
    date: todayEt(),
    mrr, plans, payingOrgs: paying.length, activeOrgs: paying.length + t!.trials,
    foundingUsed: t!.founding, foundingSpots: FOUNDING_SPOTS, trials: t!.trials,
    trialToPaid30: rate(t!.p30, t!.t30), trialToPaid90: rate(t!.p90, t!.t90),
    // Logo churn: canceled in the last 30 days over paying now plus those who left.
    churn30: rate(t!.churned, paying.length + t!.churned),
    postcardsThisMonth: m!.pieces, postcardRevenue: m!.price / 100, postcardCost: m!.cost / 100,
    monthlyCost, costPerCustomer: monthlyCost !== null && paying.length ? Math.round((monthlyCost / paying.length) * 100) / 100 : null,
  };
}

export interface AtRiskRow {
  org_id: string;
  name: string;
  plan: string;
  billing_state: string;
  last_activity: string | null;
  reason: string;
  owner_email: string | null;
}

/** Paying orgs about to churn: past due, inactive, or (with open tracking) ignoring the digest. */
export async function atRiskOrgs(sql: Sql, cfg: AtRiskConfig = AT_RISK_DEFAULTS, o: { openTracking?: boolean; now?: Date } = {}): Promise<AtRiskRow[]> {
  const now = o.now ?? new Date();
  const rows = await sql<(Omit<AtRiskRow, "reason"> & { unopened: boolean })[]>`
    with paying as (
      select o.id, o.name, o.plan, o.billing_state, o.created_at, o.last_seen_at from org o
      where o.onboarded_at is not null and o.plan in ('starter', 'pro', 'exclusive') and o.billing_state in ('active', 'past_due')
    ), act as (
      select p.*, greatest(p.last_seen_at,
        (select max(a.created_at) from lead_activity a where a.org_id = p.id and a.kind = 'status_change'),
        (select max(e.created_at) from event e where e.org_id = p.id)) as last_activity
      from paying p
    ), digests as (
      select l.org_id, l.opened_at, row_number() over (partition by l.org_id order by l.sent_at desc) as n
      from email_log l where l.kind = 'digest' and l.org_id in (select id from paying)
    )
    select a.id as org_id, a.name, a.plan, a.billing_state, a.last_activity::text,
      (select u.email::text from org_member m join auth.users u on u.id = m.user_id where m.org_id = a.id and m.role = 'owner' order by u.email limit 1) as owner_email,
      (select count(*) = ${cfg.unopenedWeeks}::int and bool_and(d.opened_at is null) from digests d where d.org_id = a.id and d.n <= ${cfg.unopenedWeeks}::int) as unopened
    from act a
    where a.billing_state = 'past_due'
      or coalesce(a.last_activity, a.created_at) < ${now}::timestamptz - make_interval(days => ${cfg.inactiveDays}::int)
      or ${o.openTracking ?? false}`;
  const out: AtRiskRow[] = [];
  for (const r of rows) {
    const reasons: string[] = [];
    if (r.billing_state === "past_due") reasons.push("Payment past due");
    const last = r.last_activity ? Date.parse(r.last_activity) : null;
    if (last === null || now.getTime() - last > cfg.inactiveDays * 86_400_000) reasons.push(`No login or lead updates in ${cfg.inactiveDays}+ days`);
    if (o.openTracking && r.unopened) reasons.push(`Digest unopened ${cfg.unopenedWeeks} weeks in a row`);
    if (reasons.length) out.push({ org_id: r.org_id, name: r.name, plan: r.plan, billing_state: r.billing_state, last_activity: r.last_activity, reason: reasons.join("; "), owner_email: r.owner_email });
  }
  return out.sort((a, b) => (a.last_activity ?? "").localeCompare(b.last_activity ?? ""));
}

/** Today's snapshot into metrics_daily (idempotent per ET date). */
export async function snapshotMetrics(sql: Sql, now = new Date()) {
  const m = await businessMetrics(sql, now);
  const rows: [string, number][] = [
    ["mrr", m.mrr], ["paying_orgs", m.payingOrgs], ["active_orgs", m.activeOrgs], ["trials", m.trials],
    ["plan_starter", m.plans.starter], ["plan_pro", m.plans.pro], ["plan_exclusive", m.plans.exclusive],
    ["founding_used", m.foundingUsed], ["postcards_month", m.postcardsThisMonth],
    ["postcard_revenue_month", m.postcardRevenue], ["postcard_cost_month", m.postcardCost],
  ];
  await sql`
    insert into metrics_daily (date, key, value)
    select ${m.date}::date, k, v from jsonb_to_recordset(${sql.json(rows.map(([k, v]) => ({ k, v })) as never)}) as x(k text, v numeric)
    on conflict (date, key) do update set value = excluded.value`;
  return m;
}

export async function metricsSeries(sql: Sql, keys: string[], days = 90) {
  return sql<{ date: string; key: string; value: number }[]>`
    select date::text, key, value::float8 as value from metrics_daily
    where key = any(${keys}) and date >= (now() at time zone ${TZ})::date - ${days}::int order by date`;
}

export async function runMetricsSnapshot(sql: Sql) {
  return withJobRun(sql, { job: "metrics" }, async (ctx) => {
    const m = await snapshotMetrics(sql);
    ctx.meta.mrr = m.mrr;
    ctx.rowsUpserted = 11;
  });
}

const cell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(head: string[], rows: (string | number | null)[][]): string {
  return [head.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\r\n") + "\r\n";
}
