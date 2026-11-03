-- Admin business metrics and at-risk accounts (issue #10).

-- Daily snapshot so trends survive Stripe changes: one value per metric per ET date.
create table metrics_daily (
  date date not null,
  key text not null,
  value numeric not null,
  primary key (date, key)
);
alter table metrics_daily enable row level security;
revoke all on metrics_daily from anon, authenticated;

-- Admin-editable settings (monthly data + infra cost, at-risk thresholds).
create table admin_setting (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table admin_setting enable row level security;
revoke all on admin_setting from anon, authenticated;

-- Facts the metrics need: when an org was last seen in the app, when it canceled,
-- and whether a digest was opened (Resend email.opened webhook).
alter table org
  add column last_seen_at timestamptz,
  add column canceled_at timestamptz;
alter table email_log add column opened_at timestamptz;
create index email_log_ref_idx on email_log (ref);
