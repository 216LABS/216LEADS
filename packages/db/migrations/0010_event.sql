-- Product usage events (DevOps addendum D6): our own table, no third-party analytics.
-- Written only by server code; customers never read it.
create table event (
  id bigserial primary key,
  name text not null check (name in ('signup', 'onboarding_done', 'lead_viewed', 'stage_changed',
    'postcard_queued', 'checkout_started', 'subscribed')),
  org_id uuid references org(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index event_name_idx on event (name, created_at desc);
create index event_org_idx on event (org_id, created_at desc);
alter table event enable row level security;
revoke all on event from anon, authenticated;
