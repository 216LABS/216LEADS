import { getSql } from "@216leads/db";
import { JOBS } from "@216leads/ingest";
import { Badge, Card, MetricTile, PageHeader } from "@/components/ui";
import { RunJobButton } from "./run-job";

export const metadata = { title: "Admin · Jobs" };
export const dynamic = "force-dynamic";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never";

export default async function JobsPage() {
  const sql = getSql();
  const [sources, runs, health] = await Promise.all([
    sql<{ code: string; name: string; schedule_cron: string; enabled: boolean; last_success_at: string | null; notes: string | null; stale: boolean }[]>`
      select code, name, schedule_cron, enabled, last_success_at, notes,
        (last_success_at is null or last_success_at < now() - interval '3 days') and schedule_cron <> '@once' as stale
      from source order by code`,
    sql<{ id: number; job: string; source_code: string | null; started_at: string; finished_at: string | null; status: string;
      rows_in: number; rows_upserted: number; rows_unmatched: number; error: string | null; meta: Record<string, unknown> }[]>`
      select id, job, source_code, started_at, finished_at, status, rows_in, rows_upserted, rows_unmatched, error, meta
      from job_run order by id desc limit 60`,
    sql<{ parcels: number; residential: number; events: number; cle_permits: number; cle_matched: number; unmatched: number; leads: number; orgs: number }[]>`
      select (select count(*) from parcel)::int as parcels,
        (select count(*) from parcel where is_residential(land_use_code, data_limited))::int as residential,
        (select count(*) from parcel_event)::int as events,
        (select count(*) from parcel_event where source = 'cle_permits')::int as cle_permits,
        (select count(*) from parcel_event where source = 'cle_permits' and parcel_key is not null)::int as cle_matched,
        (select count(*) from unmatched_record)::int as unmatched,
        (select count(*) from lead)::int as leads,
        (select count(*) from org)::int as orgs`,
  ]);
  const h = health[0]!;
  const matchPct = h.cle_permits ? (100 * h.cle_matched) / h.cle_permits : 0;

  return (
    <>
      <PageHeader title="Jobs and data health" sub="Ingest runs, source freshness and match rates. Times are Eastern." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile label="Homes (residential)" value={h.residential.toLocaleString()} sub={`${h.parcels.toLocaleString()} parcels total`} />
        <MetricTile label="Public records" value={h.events.toLocaleString()} sub={`${h.unmatched.toLocaleString()} unmatched`} />
        <MetricTile label="Cleveland permit match" value={`${matchPct.toFixed(2)}%`} sub={`${h.cle_matched.toLocaleString()} of ${h.cle_permits.toLocaleString()}`} tone={matchPct >= 99 ? "won" : "signal"} />
        <MetricTile label="Leads" value={h.leads.toLocaleString()} sub={`${h.orgs} orgs`} />
      </div>

      <h2 className="mb-2 text-lg font-bold">Sources</h2>
      <Card className="mb-8 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate">
            <tr className="border-b border-line">
              <th className="px-4 py-2">Source</th><th className="px-4 py-2">Schedule (ET)</th><th className="px-4 py-2">Last success</th><th className="px-4 py-2">Notes</th><th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.code} className="border-b border-line last:border-0">
                <td className="px-4 py-2">
                  <div className="font-semibold">{s.name}</div>
                  <div className="num text-xs text-slate">{s.code}</div>
                </td>
                <td className="num px-4 py-2 text-xs">{s.schedule_cron}</td>
                <td className="px-4 py-2">
                  {fmt(s.last_success_at)} {s.stale ? <Badge tone="lost">stale</Badge> : null}
                </td>
                <td className="max-w-xs px-4 py-2 text-xs text-slate">{s.notes}</td>
                <td className="px-4 py-2 text-right">{JOBS[s.code] ? <RunJobButton job={s.code} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-bold">Recent runs</h2>
        <div className="flex gap-2">
          <RunJobButton job="match" />
          <RunJobButton job="signals" />
          <RunJobButton job="score" />
        </div>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate">
            <tr className="border-b border-line">
              <th className="px-4 py-2">Job</th><th className="px-4 py-2">Started</th><th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Expected</th><th className="px-4 py-2 text-right">In</th>
              <th className="px-4 py-2 text-right">Upserted</th><th className="px-4 py-2 text-right">Unmatched</th><th className="px-4 py-2 text-right">Secs</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-line align-top last:border-0">
                <td className="px-4 py-2">
                  <div className="font-semibold">{r.source_code ?? r.job}</div>
                  <div className="text-xs text-slate">{r.job}{r.meta?.mode ? ` · ${String(r.meta.mode)}` : ""}</div>
                  {r.error ? <div className="mt-1 max-w-md truncate text-xs text-lost" title={r.error}>{r.error.split("\n")[0]}</div> : null}
                </td>
                <td className="px-4 py-2 text-xs">{fmt(r.started_at)}</td>
                <td className="px-4 py-2">
                  <Badge tone={r.status === "ok" ? "won" : r.status === "running" ? "navy" : r.status === "partial" ? "signal" : "lost"}>{r.status}</Badge>
                </td>
                <td className="num px-4 py-2 text-right">{r.meta?.expected != null ? Number(r.meta.expected).toLocaleString() : "–"}</td>
                <td className="num px-4 py-2 text-right">{r.rows_in.toLocaleString()}</td>
                <td className="num px-4 py-2 text-right">{r.rows_upserted.toLocaleString()}</td>
                <td className="num px-4 py-2 text-right">{r.rows_unmatched.toLocaleString()}</td>
                <td className="num px-4 py-2 text-right">{r.meta?.seconds != null ? String(r.meta.seconds) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
