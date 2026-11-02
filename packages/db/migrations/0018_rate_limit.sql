-- Shared rate limiter (issue #39): one row per key per fixed window, so every server instance
-- counts against the same total. Unlogged: losing counts on a crash is fine and writes are cheaper.
create unlogged table rate_limit (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 1,
  primary key (key, window_start)
);
create index rate_limit_window_idx on rate_limit (window_start);
alter table rate_limit enable row level security;
revoke all on rate_limit from anon, authenticated;
