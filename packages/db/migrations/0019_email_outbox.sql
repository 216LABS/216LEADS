-- Staging/local email sink (issue #40): outside production, rendered emails land here instead of
-- files (a Vercel deployment can't write to disk). Server only; /admin/outbox reads it.
create table email_outbox (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  to_emails text[] not null,
  reply_to text,
  subject text not null,
  html text not null,
  text text not null,
  headers jsonb not null default '{}'::jsonb,
  tag text not null
);
create index email_outbox_created_idx on email_outbox (created_at desc);
alter table email_outbox enable row level security;
revoke all on email_outbox from anon, authenticated;
