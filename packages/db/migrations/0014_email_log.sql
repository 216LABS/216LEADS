-- Spec 12: every customer email we send (or write to the local outbox), so scheduled jobs never
-- send the same digest or reminder twice. Server-only: RLS on, no policies.
create table email_log (
  id bigserial primary key,
  org_id uuid references org(id) on delete cascade,
  kind text not null,                 -- digest | welcome | trial_ending | payment_failed | mail_batch | automail_summary | invite
  dedupe_key text not null unique,    -- e.g. digest:<org>:2026-W45
  to_emails text[] not null,
  via text not null,                  -- resend | outbox
  ref text,
  sent_at timestamptz not null default now()
);
create index email_log_org_idx on email_log (org_id, sent_at desc);
alter table email_log enable row level security;

-- Lifecycle email opt-outs (issue #8): an address that unsubscribed from check-ins and summaries.
-- The digest has its own per-org recipient list instead.
create table email_optout (
  email citext not null,
  stream text not null,               -- lifecycle
  created_at timestamptz not null default now(),
  primary key (email, stream)
);
alter table email_optout enable row level security;
