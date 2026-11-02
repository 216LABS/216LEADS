-- M11 "prove it": learned-weight bookkeeping, records-request import mappings, ROI lookups.

-- Learned weights (spec 7.6) only use outcomes after `learned_since` (set by "Reset").
-- `learned_meta` keeps the won/lost averages behind each nudge for the Settings explanation.
alter table scoring_profile
  add column learned_since timestamptz,
  add column learned_meta jsonb not null default '{}'::jsonb;

-- Records-request importer (spec 5.12): one saved column mapping per source (rr_{city}).
create table import_mapping (
  source text primary key,
  county_code text not null references county(code),
  municipality text not null,
  mapping jsonb not null,
  updated_at timestamptz not null default now()
);
alter table import_mapping enable row level security;
revoke all on import_mapping from anon, authenticated;

create index attribution_org_date_idx on attribution (org_id, event_date desc);
create index lead_activity_org_kind_idx on lead_activity (org_id, kind, created_at);

-- Terms acceptance (issue #3): one row per acceptance of a terms/privacy version pair.
create table terms_acceptance (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references org(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now()
);
create index terms_acceptance_user_idx on terms_acceptance (user_id, accepted_at desc);
alter table terms_acceptance enable row level security;
create policy ta_read on terms_acceptance for select using (user_id = auth.uid());
