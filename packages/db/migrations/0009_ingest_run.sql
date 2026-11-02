-- DevOps addendum D3 names "ingest_run" rows. job_run already records every ingest run
-- (source, timing, counts, status), so ingest_run is a view over it rather than a second table.
create or replace view ingest_run as
  select id, source_code, started_at, finished_at, status, rows_in, rows_upserted, rows_unmatched, error, meta
  from job_run where job = 'ingest';
revoke all on ingest_run from anon, authenticated;

-- Ingest health checks read the latest run per source.
create index if not exists job_run_source_idx on job_run (source_code, started_at desc);
