create table org (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trade text not null,                -- template key
  logo_path text,
  phone text,
  website text,
  default_offer text,                 -- 216 HomeSignal addition: onboarding step 4
  return_address jsonb,               -- {name,line1,line2,city,state,zip}
  stripe_customer_id text unique,
  plan text not null default 'trial', -- trial | starter | pro | exclusive | canceled
  plan_status text,
  plan_interval text,                 -- 216 HomeSignal addition: month | year
  trial_ends_at timestamptz,
  payment_failed_at timestamptz,      -- 216 HomeSignal addition: banner + 7-day grace
  postcard_credits int not null default 0,
  digest_enabled boolean not null default true,
  digest_emails citext[] not null default '{}',
  digest_day int not null default 1,  -- 216 HomeSignal addition: 0=Sun..6=Sat, default Monday
  streetview_enabled boolean not null default false,
  onboarded_at timestamptz,           -- 216 HomeSignal addition
  coach_marks_seen boolean not null default false, -- 216 HomeSignal addition
  created_at timestamptz not null default now()
);

create table org_member (
  org_id uuid not null references org(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner', -- owner | member
  primary key (org_id, user_id)
);
create index org_member_user_idx on org_member (user_id);

-- 216 HomeSignal addition: team invites (Settings > Team)
create table org_invite (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references org(id) on delete cascade,
  email citext not null,
  role text not null default 'member',
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

create table territory (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references org(id) on delete cascade,
  kind text not null,                 -- zip | municipality | polygon
  zip text,
  municipality_id int references municipality(id),
  geom geometry(MultiPolygon, 4326),
  is_exclusive boolean not null default false,
  created_at timestamptz not null default now()
);
create index territory_org_idx on territory (org_id);

create table exclusivity_lock (
  trade text not null,
  zip text not null,
  org_id uuid not null references org(id) on delete cascade,
  locked_at timestamptz not null default now(),
  primary key (trade, zip)
);

create table scoring_profile (
  org_id uuid primary key references org(id) on delete cascade,
  template_key text not null,
  template_version int not null,
  weights jsonb not null default '{}'::jsonb,
  filters jsonb not null default '{}'::jsonb,
  exclusions jsonb not null default '{}'::jsonb,
  learned_weights jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table org_suppression (
  org_id uuid not null references org(id) on delete cascade,
  addr_norm text not null,
  parcel_key text,
  reason text not null default 'existing_customer',
  primary key (org_id, addr_norm)
);

create type lead_status as enum ('new','contacted','quoted','won','lost','skipped');

create table lead (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references org(id) on delete cascade,
  parcel_key text not null references parcel(parcel_key),
  score int not null check (score between 0 and 100),
  reasons jsonb not null,
  pitch text,
  trigger_event_id bigint references parcel_event(id),
  trigger_label text,
  trigger_date date,                  -- 216 HomeSignal addition: drives "Sold 6 days ago"
  status lead_status not null default 'new',
  status_changed_at timestamptz not null default now(),
  first_touch_at timestamptz,
  won_amount int,
  lost_reason text,                   -- price | timing | competitor | no_response | other
  visible_from timestamptz not null default now(),
  first_surfaced_at timestamptz not null default now(),
  last_scored_at timestamptz not null default now(),
  hidden boolean not null default false,
  unique (org_id, parcel_key)
);
create index lead_org_status_idx on lead (org_id, status, score desc);

create table lead_note (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references org(id) on delete cascade,
  lead_id uuid not null references lead(id) on delete cascade,
  author_id uuid references auth.users(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index lead_note_lead_idx on lead_note (lead_id, created_at desc);

create table lead_activity (
  id bigserial primary key,
  org_id uuid not null references org(id) on delete cascade,
  lead_id uuid references lead(id) on delete cascade,
  kind text not null,                 -- status_change | note | postcard_sent | postcard_delivered | attribution | export
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index lead_activity_org_idx on lead_activity (org_id, created_at desc);

create table postcard_template (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references org(id) on delete cascade, -- null = system template
  trade text,
  name text not null,
  size text not null default '4x6',
  front_html text not null,
  back_html text not null,
  merge_defaults jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table mail_rule (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references org(id) on delete cascade,
  template_id uuid not null references postcard_template(id),
  enabled boolean not null default false,
  min_score int not null default 70,
  trigger_kinds event_kind[] not null default '{sale}',
  max_per_week int not null default 50,
  monthly_cap_cents int not null default 10000,
  followup_days int[] not null default '{}',
  created_at timestamptz not null default now()
);

create table mail_piece (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references org(id) on delete cascade,
  lead_id uuid references lead(id) on delete set null,
  parcel_key text not null references parcel(parcel_key),
  template_id uuid references postcard_template(id),
  rule_id uuid references mail_rule(id),
  provider text not null,             -- lob | postgrid | dryrun
  provider_id text,
  status text not null default 'queued',
  to_name text not null default 'Current Resident',
  to_address jsonb not null,
  merge_variables jsonb not null default '{}'::jsonb, -- 216 HomeSignal addition
  send_after timestamptz not null default now() + interval '15 minutes',
  cost_cents int,
  price_cents int,
  billed_via text,                    -- credit | metered
  expected_delivery date,
  events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index mail_piece_org_idx on mail_piece (org_id, created_at desc);
create index mail_piece_parcel_idx on mail_piece (org_id, parcel_key, created_at desc);

create table suppression (
  addr_norm text primary key,
  parcel_key text,
  reason text not null default 'homeowner_request', -- homeowner_request | returned_mail | legal
  created_at timestamptz not null default now()
);

create table attribution (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references org(id) on delete cascade,
  lead_id uuid not null references lead(id) on delete cascade,
  parcel_event_id bigint not null references parcel_event(id),
  outcome text not null,              -- won_self | lost_competitor | sold | unknown
  competitor_id bigint references contractor(id),
  touched_at timestamptz not null,
  event_date date not null,
  days_to_event int not null,
  confirmed_by_user boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, lead_id, parcel_event_id)
);

create table digest_send (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references org(id) on delete cascade,
  week_of date not null,
  lead_ids uuid[] not null,
  resend_id text,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, week_of)
);

create table usage_ledger (
  id bigserial primary key,
  org_id uuid not null references org(id) on delete cascade,
  kind text not null,                 -- postcard | credit_grant | credit_use | export
  qty int not null,
  amount_cents int,
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index usage_ledger_org_idx on usage_ledger (org_id, kind, created_at desc);

create table prospect_request (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  business text,
  trade text,
  zips text[],
  created_at timestamptz not null default now()
);
