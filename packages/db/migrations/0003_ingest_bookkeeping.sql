create table source (
  code text primary key,
  name text not null,
  url text not null,
  schedule_cron text not null,        -- interpreted in America/New_York
  enabled boolean not null default true,
  cursor jsonb not null default '{}'::jsonb,
  last_success_at timestamptz,
  notes text
);

create table job_run (
  id bigserial primary key,
  source_code text references source(code),
  job text not null,                  -- ingest | match | signals | score | digest | automail | attribution
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running', -- running | ok | error | partial
  rows_in int not null default 0,
  rows_upserted int not null default 0,
  rows_unmatched int not null default 0,
  error text,
  meta jsonb not null default '{}'::jsonb
);
create index job_run_started_idx on job_run (started_at desc);
