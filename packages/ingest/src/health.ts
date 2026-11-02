// Ingest freshness (DevOps addendum D3): the health route and the 36-hour watchdog both use it.
import type { Sql } from "@216leads/db";

/** Daily sources whose silence means the data stopped updating. */
export const DAILY_SOURCES = ["cuy_parcels", "cle_permits", "cle_violations"];
export const STALE_AFTER_HOURS = 36;

export interface IngestHealth {
  ok: boolean;
  last_success_at: string | null;
  age_hours: number | null;
  stale_sources: { source: string; last_success_at: string | null }[];
}

export async function ingestHealth(sql: Sql): Promise<IngestHealth> {
  const rows = await sql<{ source: string; last: string | null }[]>`
    select s.source, max(r.finished_at) as last
    from unnest(${DAILY_SOURCES}::text[]) as s(source)
    left join ingest_run r on r.source_code = s.source and r.status = 'ok'
    group by s.source`;
  const now = Date.now();
  const stale = rows.filter((r) => !r.last || now - Date.parse(r.last) > STALE_AFTER_HOURS * 3_600_000);
  const latest = rows.map((r) => r.last).filter((x): x is string => !!x).sort().pop() ?? null;
  return {
    ok: stale.length === 0,
    last_success_at: latest,
    age_hours: latest ? Math.round(((now - Date.parse(latest)) / 3_600_000) * 10) / 10 : null,
    stale_sources: stale.map((r) => ({ source: r.source, last_success_at: r.last })),
  };
}
