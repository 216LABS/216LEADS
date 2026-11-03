import Link from "next/link";
import { getSql } from "@216leads/db";
import { monthlySeries, proofRows, roiMetrics, type MonthPoint } from "@216leads/ingest";
import { planLimits, titleCase } from "@216leads/shared";
import { requireOrg } from "@/lib/session";
import { monthRange, shiftMonth } from "@/lib/roi";
import { Card, EmptyState, LinkButton, MetricTile, PageHeader } from "@/components/ui";
import { DownloadButton } from "@/components/download-button";

export const metadata = { title: "Results" };
export const dynamic = "force-dynamic";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const OUTCOME: Record<string, string> = { won_self: "You won it", lost_competitor: "Went to", sold: "Home sold", unknown: "Permit pulled, no business named" };

function Chart({ series }: { series: MonthPoint[] }) {
  const max = Math.max(1, ...series.map((p) => Math.max(p.mailed, p.won)));
  const W = 640, H = 160, step = W / series.length, bar = Math.min(18, step / 2 - 4);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label="Postcards mailed and jobs won per month, last 12 months" className="w-full">
        <line x1="0" x2={W} y1={H} y2={H} stroke="currentColor" className="text-line" />
        {series.map((p, i) => {
          const x = i * step + step / 2;
          const hm = (p.mailed / max) * (H - 8);
          const hw = (p.won / max) * (H - 8);
          return (
            <g key={p.month}>
              <rect x={x - bar - 1} y={H - hm} width={bar} height={hm} rx="3" className="fill-navy"><title>{`${p.month}: ${p.mailed} mailed`}</title></rect>
              <rect x={x + 1} y={H - hw} width={bar} height={hw} rx="3" className="fill-won"><title>{`${p.month}: ${p.won} won`}</title></rect>
              <text x={x} y={H + 16} textAnchor="middle" className="fill-slate text-[10px]">{new Date(`${p.month}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex gap-4 text-xs text-slate">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-navy" />Mailed</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-won" />Won</span>
      </figcaption>
    </figure>
  );
}

// ROI dashboard (spec 9.6): this month's numbers, proof from public records, mailed vs won.
export default async function RoiPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { org } = await requireOrg();
  if (!planLimits(org.plan).marketTools) {
    return (
      <>
        <PageHeader title="Results" />
        <EmptyState title="Results come with Pro" action={<LinkButton href="/settings/billing">See plans</LinkButton>}>
          See what you mailed, what you won, and which of your homes later pulled a permit, with the business that got the job.
        </EmptyState>
      </>
    );
  }
  const r = monthRange((await searchParams).month);
  const sql = getSql();
  const [m, proof, series] = await Promise.all([roiMetrics(sql, org.id, r.from, r.to), proofRows(sql, org.id, r.from, r.to), monthlySeries(sql, org.id)]);
  const current = r.month === monthRange().month;

  return (
    <>
      <PageHeader
        title="Results"
        sub={monthLabel(r.month)}
        actions={
          <>
            <LinkButton variant="secondary" href={`/roi?month=${shiftMonth(r.month, -1)}`} aria-label="Previous month">←</LinkButton>
            {!current ? <LinkButton variant="secondary" href={`/roi?month=${shiftMonth(r.month, 1)}`} aria-label="Next month">→</LinkButton> : null}
            <DownloadButton href={`/api/roi/pdf?month=${r.month}`}>Download PDF</DownloadButton>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile label="Homes surfaced" value={m.surfaced.toLocaleString("en-US")} />
        <MetricTile label="Contacted" value={m.contacted.toLocaleString("en-US")} />
        <MetricTile label="Mailed" value={m.mailed.toLocaleString("en-US")} />
        <MetricTile label="Quotes" value={m.quotes.toLocaleString("en-US")} />
        <MetricTile label="Jobs won" value={m.won.toLocaleString("en-US")} tone="won" />
        <MetricTile label="Revenue won" value={money(m.revenue)} tone="won" />
        <MetricTile label="Cost" value={money(m.costSubscription + m.costPostcards)} sub={`Plan ${money(m.costSubscription)} + postcards ${money(m.costPostcards)}`} />
        <MetricTile label="Return on cost" value={m.roi === null ? "–" : `${m.roi}×`} sub={m.roi === null ? "No cost yet" : "Revenue ÷ cost"} tone="signal" />
      </div>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Proof from public records</h2>
      <p className="mb-3 text-sm text-slate">Homes you mailed or reached out to that later pulled a permit for your kind of work, or sold.</p>
      {proof.length ? (
        <Card className="divide-y divide-line">
          {proof.map((p) => (
            <div key={`${p.lead_id}-${p.event_date}-${p.outcome}`} className="flex flex-wrap items-baseline justify-between gap-2 p-4 text-sm">
              <div>
                <Link href={`/leads/${p.lead_id}`} className="focus-ring font-semibold text-navy hover:underline">{titleCase(p.addr_line)}, {titleCase(p.city)}</Link>
                <div className="text-slate">{p.description ?? ""}</div>
              </div>
              <div className="text-right">
                <div className={p.outcome === "won_self" ? "font-semibold text-won" : "font-semibold"}>
                  {OUTCOME[p.outcome] ?? p.outcome}{p.outcome === "lost_competitor" ? ` ${p.competitor ?? "a competitor"}` : ""}
                </div>
                <div className="text-xs text-slate">
                  {p.event_date} · {p.days_to_event} days after you {p.mailed ? "mailed" : "reached out"}
                  {p.source_url ? <> · <a className="underline" href={p.source_url} target="_blank" rel="noreferrer">record</a></> : null}
                </div>
              </div>
            </div>
          ))}
        </Card>
      ) : (
        <Card className="p-5 text-sm text-slate">Nothing yet for {monthLabel(r.month)}. Cities post permits days to weeks after the work, so matches show up later.</Card>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold">Mailed vs won, last 12 months</h2>
      <Card className="p-5"><Chart series={series} /></Card>
    </>
  );
}
