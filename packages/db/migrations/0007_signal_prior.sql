-- Population averages for signals, computed by the `signals` job from homes that have the
-- data. When a home's town has no data for a signal (e.g. no public permits), scoring uses
-- this average instead of dropping the signal or counting it as zero, so towns with less
-- public data are neither inflated nor penalized.
create table signal_prior (
  key text primary key,
  value numeric(5,4) not null,
  n int not null,
  computed_at timestamptz not null default now()
);
alter table signal_prior enable row level security;
revoke all on signal_prior from anon, authenticated;
