import { withBase } from "@216leads/shared";
import { buttonClass, Card, MetricTile, PageHeader } from "@/components/ui";
import { metricsPayload } from "@/lib/metrics";
import { MetricsSettings } from "./settings-form";

export const metadata = { title: "Admin · Metrics" };
export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const pct = (n: number | null) => (n === null ? "–" : `${n}%`);

function Line({ points, label }: { points: { date: string; value: number }[]; label: string }) {
  if (points.length < 2) return <p className="text-sm text-slate">{label}: the chart fills in as daily snapshots build up.</p>;
  const W = 600, H = 120;
  const max = Math.max(...points.map((p) => p.value), 1);
  const d = points.map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * W).toFixed(1)},${(H - (p.value / max) * (H - 10)).toFixed(1)}`).join(" ");
  return (
    <figure>
      <figcaption className="mb-1 text-sm font-semibold">{label} <span className="font-normal text-slate">({points[0]!.date} to {points.at(-1)!.date})</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label} over time`}>
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" className="text-navy" />
      </svg>
    </figure>
  );
}

// Issue #10: how the business is doing, and who's about to churn, without opening Stripe.
export default async function MetricsPage() {
  const { metrics: m, at_risk, at_risk_config: cfg, open_tracking, series } = await metricsPayload();
  const of = (k: string) => series.filter((s) => s.key === k).map((s) => ({ date: s.date, value: s.value }));
  return (
    <>
      <PageHeader title="Metrics" sub={`As of ${m.date}. Snapshots save daily for trends.`}
        actions={<a className={buttonClass("secondary")} href={withBase("/api/admin/metrics/daily.csv")}>Daily CSV</a>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile label="MRR" value={money(m.mrr)} sub="Active subscriptions, founding price applied" tone="won" />
        <MetricTile label="Paying orgs" value={m.payingOrgs} sub={`Starter ${m.plans.starter} · Pro ${m.plans.pro} · Exclusive ${m.plans.exclusive}`} />
        <MetricTile label="Active trials" value={m.trials} />
        <MetricTile label="Founding spots" value={`${m.foundingUsed} of ${m.foundingSpots}`} />
        <MetricTile label="Trial to paid" value={pct(m.trialToPaid30)} sub={`30 days · 90 days ${pct(m.trialToPaid90)}`} />
        <MetricTile label="Logo churn" value={pct(m.churn30)} sub="Last 30 days" />
        <MetricTile label="Postcards this month" value={m.postcardsThisMonth} sub={`Revenue ${money(m.postcardRevenue)} · cost ${money(m.postcardCost)}`} />
        <MetricTile label="Cost per customer" value={m.costPerCustomer === null ? "–" : money(m.costPerCustomer)} sub={m.monthlyCost === null ? "Enter a monthly cost below" : `${money(m.monthlyCost)} a month`} />
      </div>
      <Card className="mt-6 grid gap-6 p-5 md:grid-cols-2">
        <Line points={of("mrr")} label="MRR" />
        <Line points={of("active_orgs")} label="Active orgs" />
      </Card>

      <div className="mb-2 mt-8 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">At risk ({at_risk.length})</h2>
        <a className="text-sm font-semibold underline" href={withBase("/api/admin/metrics/at-risk.csv")}>CSV</a>
      </div>
      <p className="mb-2 text-xs text-slate">
        Past due, no login or lead updates in {cfg.inactiveDays} days{open_tracking ? `, or the digest unopened ${cfg.unopenedWeeks} weeks in a row` : ". Digest-open tracking turns on with RESEND_WEBHOOK_SECRET"}.
      </p>
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-xs uppercase text-slate">
            <th className="px-4 py-2">Org</th><th className="px-4 py-2">Plan</th><th className="px-4 py-2">Last activity</th><th className="px-4 py-2">Reason</th><th className="px-4 py-2">Owner</th>
          </tr></thead>
          <tbody>
            {at_risk.map((r) => (
              <tr key={r.org_id} className="border-b border-line last:border-0">
                <td className="px-4 py-2 font-semibold">{r.name}</td><td className="px-4 py-2">{r.plan}</td>
                <td className="px-4 py-2 text-slate">{r.last_activity?.slice(0, 10) ?? "never"}</td>
                <td className="px-4 py-2">{r.reason}</td><td className="px-4 py-2 text-slate">{r.owner_email ?? ""}</td>
              </tr>
            ))}
            {!at_risk.length ? <tr><td colSpan={5} className="px-4 py-4 text-slate">Nobody at risk right now.</td></tr> : null}
          </tbody>
        </table>
      </Card>
      <MetricsSettings monthlyCost={m.monthlyCost} inactiveDays={cfg.inactiveDays} unopenedWeeks={cfg.unopenedWeeks} />
    </>
  );
}
