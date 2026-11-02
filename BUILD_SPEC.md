# 216 Leads: Build Spec (v1.0, 2026-11-01)

Product: **216 Leads by 216LABS** (served at 216labs.dev/leads). Owner: Sam Filipiak (216LABS LLC, Lakewood, OH).
Audience: an AI coding agent (Claude Code) building the product end to end in a fresh repo. Facts checked live on 2026-11-01 are marked **[V]**. Design decisions are **[J]**. Secondary-source facts to re-check before relying on them are **[S]**.

Read sections 0, 1 and 16 before writing any code.

---

## 0. Ground rules for the coding agent

1. Build in milestones (M1, M2, M3). Do not start a milestone until the previous one passes its acceptance criteria (section 15).
2. TypeScript everywhere (strict). Python is allowed only inside `packages/ingest/py` where a library makes it much easier (PDF table parsing); default to TypeScript.
3. Every external data pull is idempotent and resumable. Store raw payloads before transforming.
4. Never put secrets in code, fixtures, logs or test snapshots. Use the env var names in section 3.
5. Never store or display homeowner names anywhere: UI, exports, postcards, emails (section 14). The ingest layer drops owner-name fields at parse time.
6. No captcha solving, no login-walled scraping, no token-walled ArcGIS layers. If a source needs any of those, skip it and log it.
7. Prefer boring, well-documented libraries. Keep the app deployable by one person.

---

## 1. Product summary

216 Leads is a mobile-friendly web app that tells a Northeast Ohio home-service business (roofer, HVAC, plumber, electrician, lawn care, tree, painter, gutters, siding, remodeler, pest, septic, waterproofing) **which specific homes are most likely to need them next, and why**. It is built from free public records: county parcels and sales, city permits, code violations, rental registry, condemnations, FEMA flood zones and county tree canopy. Then it lets them **act**: track leads in a tiny pipeline and mail a postcard to one, many, or every new matching home automatically. Won/lost outcomes and later public permits feed back into scoring and power an ROI report.

It is **not** a field-service CRM. No invoicing, scheduling, dispatch, estimates or payments.

### Core loop
1. Data lands daily (county sales, city permits, violations) and monthly (county permit lists, records requests).
2. Each home gets a per-trade score plus "why this home" reasons, tuned by the customer's "perfect customer" settings.
3. Monday 6:00 AM ET digest email: top new homes this week, linking into the app.
4. Customer works the list (status, notes), mails selected homes, or turns on auto-mail.
5. When a later permit or sale shows up at a home they touched, we attribute it (won by them, or lost to a named competitor) and show ROI.

### Milestones
| Milestone | Target | Scope |
|---|---|---|
| M1 "Sellable list" | weeks 1-2 | Ingest Cuyahoga parcels + sales, Cleveland permits/violations/rentals/condemnations, canopy, FEMA. Scoring engine with 6 trade templates. Auth, org, territories, onboarding wizard, lead list, lead detail with reasons, statuses + notes, CSV export (no names), Monday digest, Stripe Checkout for 3 plans, admin jobs page. |
| M2 "Act on it" | week 3 | Map view, postcard builder + Lob (manual send + auto-mail rules), credits + metered billing, neighbor ring, competitor tracker, Lake/Stark/Medina ingestion, territory exclusivity. |
| M3 "Prove it" | weeks 4-6 | Attribution matcher + ROI dashboard, market heat map, violations fix list, feedback-tuned weights, Summit ingestion, records-request CSV/XLSX/PDF importer, homeowner opt-out page, remaining 7 trade templates. |

---

## 2. Stack and repo structure

### Stack [J]
| Layer | Choice | Why |
|---|---|---|
| Web app | Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui | One codebase, server actions, Vercel |
| DB | Supabase Postgres with PostGIS, pg_trgm, pgcrypto, citext | Geo queries, RLS multi-tenancy, auth included |
| Auth | Supabase Auth (email magic link + Google) | No passwords to manage |
| Data access | Drizzle ORM; SQL migrations in `packages/db/migrations` are the source of truth | Typed, thin |
| Jobs | `packages/ingest` CLI (`pnpm ingest <job>`) on a Fly.io machine with a cron schedule (or GitHub Actions cron). Light jobs (digest, automail) via Supabase Cron (pg_cron + pg_net) calling `/api/cron/:job` | Vercel functions time out on big pulls |
| Queue | `job` table with `FOR UPDATE SKIP LOCKED` (or Supabase Queues/pgmq) | No extra infra |
| Maps | MapLibre GL JS + MapTiler or Protomaps vector style; our API serves GeoJSON | Avoid per-load Mapbox bills |
| Email | Resend + React Email | Digest + transactional |
| Print & mail | Lob Print & Mail API (primary), PostGrid (fallback, same interface) | Per-piece API with webhooks |
| Billing | Stripe Billing: subscriptions + Billing Meter for postcards + Customer Portal | Standard |
| Observability | Sentry (web + worker), `job_run` table + `/admin` page, optional Axiom | Solo-dev friendly |
| Tests | Vitest, Playwright, SQL tests for RLS | |

### Repo layout
```
216-leads/
  apps/web/                  # Next.js app
    app/(marketing)/         # landing, pricing, sample, coverage, legal, optout
    app/(app)/               # authed: leads, map, mail, roi, settings, onboarding
    app/admin/               # jobs, sources, unmatched, orgs
    app/api/                 # route handlers (section 8)
    components/              # UI components (section 9.9)
    emails/                  # React Email templates
    lib/                     # db, auth, stripe, mail provider, scoring client
  packages/db/               # SQL migrations, drizzle schema, seed
  packages/scoring/          # pure TS engine + templates/*.yaml
  packages/ingest/           # adapters, normalizers, matcher, CLI, fixtures
  packages/shared/           # types, zod schemas, address utils
  .github/workflows/         # CI (+ optional cron)
  fly.toml
  BUILD_SPEC.md
```
Use pnpm workspaces + Turborepo.

---

## 3. Environment variables (names only)

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL                 # pooled
DATABASE_URL_DIRECT          # migrations + ingest
# App
APP_BASE_URL
CRON_SECRET                  # bearer token for /api/cron/*
ADMIN_EMAILS                 # comma list allowed into /admin
# Stripe
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_STARTER_MONTHLY
STRIPE_PRICE_STARTER_ANNUAL
STRIPE_PRICE_PRO_MONTHLY
STRIPE_PRICE_PRO_ANNUAL
STRIPE_PRICE_EXCLUSIVE_MONTHLY
STRIPE_PRICE_EXCLUSIVE_ANNUAL
STRIPE_PRICE_POSTCARD_METERED
STRIPE_METER_POSTCARDS       # Billing Meter event name, e.g. postcards_sent
# Resend
RESEND_API_KEY
RESEND_FROM_DIGEST
RESEND_FROM_TRANSACTIONAL
RESEND_WEBHOOK_SECRET
# Print & mail
MAIL_PROVIDER                # lob | postgrid
LOB_API_KEY
LOB_WEBHOOK_SECRET
LOB_ENV                      # test | live
POSTGRID_API_KEY
# Maps
NEXT_PUBLIC_MAP_STYLE_URL
NEXT_PUBLIC_MAPTILER_KEY
GOOGLE_STREETVIEW_KEY        # optional, off by default
# Bot protection on public forms
TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY
# Observability
SENTRY_DSN
NEXT_PUBLIC_SENTRY_DSN
AXIOM_TOKEN                  # optional
# Ingest
INGEST_USER_AGENT            # "216Leads/1.0 (+https://216labs.dev/leads/data)"
INGEST_RAW_BUCKET            # Supabase Storage bucket for raw payloads
```

---

## 4. Database schema (Postgres + PostGIS)

Conventions: snake_case; uuid PKs for tenant tables; natural keys for public-record tables; all timestamps `timestamptz`; tenant tables carry `org_id` and have RLS. Run as ordered migrations.

```sql
-- 0001_extensions.sql
create extension if not exists postgis;
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;
create extension if not exists citext;

-- 0002_public_records.sql  (no direct client access; see RLS section)
create table county (
  code text primary key,              -- 'cuyahoga','lake','stark','medina','summit'
  name text not null
);

create table municipality (
  id serial primary key,
  county_code text not null references county(code),
  name text not null,                 -- 'CLEVELAND','LAKEWOOD',...
  data_tier text not null default 'county_only', -- open_api | monthly_list | records_request | county_only
  unique (county_code, name)
);

create table parcel (
  parcel_key text primary key,        -- '{county_code}:{parcel_id}' e.g. 'cuyahoga:01315013'
  county_code text not null references county(code),
  parcel_id text not null,
  municipality_id int references municipality(id),
  addr_line text not null,            -- '1234 W 117TH ST'
  addr_unit text,
  city text not null,
  zip text not null,                  -- 5-char string
  addr_norm text not null,            -- section 6
  geom geometry(Point, 4326),
  land_use_code text,
  land_use_desc text,
  is_single_family boolean,
  year_built int,
  living_sqft int,
  rooms int,
  style text,                         -- COL, CAP, RAN, SPL, BUN ...
  lot_acres numeric(8,4),
  lot_sqft int,
  garage_type text,
  gas_service boolean,
  water_source text,                  -- MUN | PVT | N
  sewer_type text,                    -- SNS | SAN | SP | SPS | ST | N
  market_value int,
  assessed_value int,
  owner_occupied_guess boolean,       -- mailing address == site address
  is_rental boolean not null default false,
  last_sale_date date,
  last_sale_price int,
  foreclosure_flag boolean,
  tax_delinquent boolean,
  canopy_pct numeric(5,2),
  grass_pct numeric(5,2),
  impervious_pct numeric(5,2),
  flood_zone text,
  in_sfha boolean,
  bldg_height_ft numeric(6,1),
  survey_2022 jsonb,                  -- Cleveland 2022 property survey conditions
  data_limited boolean not null default false, -- true for stub parcels (Stark, Medina)
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (county_code, parcel_id)
);
create index parcel_geom_gix on parcel using gist (geom);
create index parcel_zip_idx on parcel (zip);
create index parcel_muni_idx on parcel (municipality_id);
create index parcel_addr_trgm on parcel using gin (addr_norm gin_trgm_ops);
create index parcel_sale_idx on parcel (last_sale_date desc);

create table contractor (
  id bigserial primary key,
  name_norm text unique not null,     -- upper, punctuation stripped, LLC/INC/CO removed
  display_name text not null,
  license_id text,
  phone text,                         -- only when the permit record publishes a business phone
  is_individual boolean not null default false, -- true if looks like a person; never displayed by name
  created_at timestamptz not null default now()
);
create table contractor_alias (
  alias_norm text primary key,
  contractor_id bigint not null references contractor(id)
);

create type event_kind as enum ('sale','permit','violation','rental_registration','condemnation',
  'certificate_of_occupancy','demolition','boardup','lead_safe','disclosure');

create table parcel_event (
  id bigserial primary key,
  parcel_key text references parcel(parcel_key),  -- null until matched
  kind event_kind not null,
  source text not null,               -- 'cle_permits','cuy_sales','lake_xlsx','medina_list','rr_parma',...
  source_record_id text not null,
  event_date date not null,
  category text,                      -- normalized trade category (7.3)
  raw_type text,
  description text,                   -- trimmed to 2,000 chars
  amount int,                         -- job value or sale price
  contractor_id bigint references contractor(id),
  status text,
  is_active boolean,
  arms_length boolean,
  source_url text,                    -- e.g. ACCELA_CITIZEN_ACCESS_URL
  geom geometry(Point, 4326),
  match_method text,                  -- parcel_id | address_exact | address_fuzzy | geo
  match_confidence numeric(3,2),
  raw_ref text,                       -- storage path of raw page
  ingested_at timestamptz not null default now(),
  unique (source, source_record_id)
);
create index pe_parcel_idx on parcel_event (parcel_key, event_date desc);
create index pe_kind_idx on parcel_event (kind, event_date desc);
create index pe_cat_idx on parcel_event (category, event_date desc);
create index pe_contractor_idx on parcel_event (contractor_id, event_date desc);
create index pe_geom_gix on parcel_event using gist (geom);

create table parcel_signal (           -- materialized per-parcel signal values (7.7)
  parcel_key text not null references parcel(parcel_key) on delete cascade,
  key text not null,                  -- e.g. 'last_permit_age:roofing'
  value numeric(5,4) not null,        -- 0..1
  evidence jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  primary key (parcel_key, key)
);

create table unmatched_record (
  id bigserial primary key,
  source text not null,
  source_record_id text not null,
  addr_raw text, city_raw text, zip_raw text, parcel_raw text,
  payload jsonb not null,             -- owner fields already removed
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  unique (source, source_record_id)
);

create table flood_zone (
  id bigserial primary key,
  fld_zone text, zone_subty text, sfha boolean,
  geom geometry(MultiPolygon, 4326)
);
create index flood_zone_gix on flood_zone using gist (geom);

-- 0003_ingest_bookkeeping.sql
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

-- 0004_tenant.sql
create table org (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trade text not null,                -- template key (7.5)
  logo_path text,
  phone text,
  website text,
  return_address jsonb,               -- {name,line1,line2,city,state,zip}
  stripe_customer_id text unique,
  plan text not null default 'trial', -- trial | starter | pro | exclusive | canceled
  plan_status text,
  trial_ends_at timestamptz,
  postcard_credits int not null default 0,
  digest_enabled boolean not null default true,
  digest_emails citext[] not null default '{}',
  streetview_enabled boolean not null default false,
  created_at timestamptz not null default now()
);
create table org_member (
  org_id uuid not null references org(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner', -- owner | member
  primary key (org_id, user_id)
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
  weights jsonb not null default '{}'::jsonb,         -- {"signal_key": 0|0.5|1|1.5|2}
  filters jsonb not null default '{}'::jsonb,         -- {"year_built_max":1970,"price_min":150000,"lot_acres_min":0.25,"gas":"any","owner_occupied":true}
  exclusions jsonb not null default '{}'::jsonb,      -- {"rentals":true,"condos":true,"streets":[],"parcel_keys":[]}
  learned_weights jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table org_suppression (          -- e.g. current customers uploaded by the org
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
  reasons jsonb not null,             -- [{key,label,points,evidence:{event_id?,value?,date?,url?}}]
  pitch text,
  trigger_event_id bigint references parcel_event(id),
  trigger_label text,
  status lead_status not null default 'new',
  status_changed_at timestamptz not null default now(),
  first_touch_at timestamptz,         -- first contacted or mailed
  won_amount int,
  lost_reason text,                   -- price | timing | competitor | no_response | other
  visible_from timestamptz not null default now(), -- exclusivity delay (13)
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
create table lead_activity (
  id bigserial primary key,
  org_id uuid not null references org(id) on delete cascade,
  lead_id uuid references lead(id) on delete cascade,
  kind text not null,                 -- status_change | note | postcard_sent | postcard_delivered | attribution | export
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table postcard_template (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references org(id) on delete cascade, -- null = system template
  trade text,
  name text not null,
  size text not null default '4x6',
  front_html text not null,
  back_html text not null,
  merge_defaults jsonb not null default '{}'::jsonb, -- headline, offer, expires, phone, url
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
  provider text not null,             -- lob | postgrid
  provider_id text,
  status text not null default 'queued', -- queued | submitted | mailed | in_transit | delivered | returned | canceled | failed
  to_name text not null default 'Current Resident',
  to_address jsonb not null,
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

create table suppression (               -- global homeowner opt-outs and bad addresses
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

create table prospect_request (          -- marketing-site sample requests
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  business text,
  trade text,
  zips text[],
  created_at timestamptz not null default now()
);
```

### RLS

```sql
create or replace function is_org_member(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_member m where m.org_id = o and m.user_id = auth.uid());
$$;

alter table org enable row level security;
create policy org_rw on org for all using (is_org_member(id)) with check (is_org_member(id));

-- For each of: org_member, territory, scoring_profile, org_suppression, lead, lead_note,
-- lead_activity, mail_rule, mail_piece, attribution, digest_send, usage_ledger
--   alter table X enable row level security;
--   create policy X_rw on X for all using (is_org_member(org_id)) with check (is_org_member(org_id));

alter table postcard_template enable row level security;
create policy pt_read on postcard_template for select using (org_id is null or is_org_member(org_id));
create policy pt_write on postcard_template for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- Public-record tables: revoke from anon/authenticated. Access only through
-- server code (service role) or security-definer functions that filter by territory:
revoke all on parcel, parcel_event, parcel_signal, contractor from anon, authenticated;

create or replace function org_parcel_keys(o uuid) returns setof text
language sql stable security definer set search_path = public as $$
  select p.parcel_key from parcel p
  where is_org_member(o) and exists (
    select 1 from territory t where t.org_id = o and (
      (t.kind = 'zip' and t.zip = p.zip) or
      (t.kind = 'municipality' and t.municipality_id = p.municipality_id) or
      (t.kind = 'polygon' and st_contains(t.geom, p.geom))));
$$;
```
Any API endpoint returning parcel data must check the parcel is in `org_parcel_keys(current_org)` and return 404 otherwise. This stops one customer from dumping the county.

---

## 5. Ingestion jobs

### 5.0 Shared ArcGIS adapter
- Request: `GET {layer}/query?where=...&outFields=...&returnGeometry=false|true&outSR=4326&orderByFields=OBJECTID&resultOffset=N&resultRecordCount=1000&f=json` (use 2000 where the layer's maxRecordCount allows).
- Response dates are epoch milliseconds UTC. Convert to an `America/New_York` calendar date.
- Date filter syntax that works on these servers: `ISSUE_DATE >= DATE '2026-10-01'` [V].
- Run `returnCountOnly=true` first and log the expected count. Page until a page returns fewer rows than requested and `exceededTransferLimit` is not true.
- Retry 3x with exponential backoff on 5xx/timeouts. Max 1 request/second per host.
- Always send `User-Agent: ${INGEST_USER_AGENT}`. Lake County returned 403 to a bare Python client and worked with a browser-style UA [V]; if the custom UA is refused, fall back to a standard browser UA string. Do not do anything beyond that.
- Store each raw page gzip at `${INGEST_RAW_BUCKET}/{source}/{yyyy-mm-dd}/{offset}.json.gz` after removing DROP fields.
- Upsert by `(source, source_record_id)`.
- **DROP** fields listed per source are removed before anything is persisted.

Schedules below are ET.

### 5.1 `cuy_parcels`: Cuyahoga tax parcels + sale events (daily) [V]
- URL: `https://gis.cuyahogacounty.gov/server/rest/services/CCFO/Parcel_Fabric_Taxparcels/FeatureServer/1/query`
- 572,828 rows; `update_date` refreshed daily; `last_transfer_date` ran to 2026-10-29 on 2026-11-01 [V].
- Schedule: daily 04:30 (delta: `update_date >= DATE '{today-3}' OR last_transfer_date >= DATE '{today-21}'`); full refresh Sunday 02:00.
- Residential filter: `tax_luc IN ('5100','5200','5300','5500')`. 5100 = single family [V]; confirm the others from `tax_luc_description` on first run [S].

| Source field | Target | Notes |
|---|---|---|
| parcel_id | parcel_id | 8 digits, e.g. `01315013` [V] |
| parcel_addr, parcel_predir, parcel_street, parcel_suffix | addr_line | keep `par_addr_all` only for display fallback |
| parcel_unit | addr_unit | |
| parcel_city | city | |
| parcel_zip | zip | numeric in source (44144) [V]; left-pad |
| tax_luc / tax_luc_description | land_use_code / desc | |
| max_age | year_built | it is a year (e.g. 1935) [V] |
| total_res_liv_area | living_sqft | |
| total_res_rooms | rooms | |
| res_styles | style | 1-family counts: COL 140,429; CAP 87,315; RAN 83,502; SPL 22,334; BUN 9,844 [V] |
| parcel_acreage | lot_acres | |
| parcel_lot_size | lot_sqft | |
| garage_type | garage_type | ATTACHED, DETACHED, BASEMENT, BUILT-IN, MULTIPLE [V] |
| gas | gas_service | 'Y' 344,195; 'N' 8,777 among 1-family [V]. N = no gas line (electric, oil or propane heat) |
| water | water_source | MUN 348,414; PVT 2,781 (private well); N 1,814 [V] |
| sewer | sewer_type | values SNS, SAN, SP, SPS, ST, N [V]. SP/SPS meaning (private/septic) is [S]: confirm before shipping the septic template |
| tax_market_total | market_value | |
| tax_assessed_total | assessed_value | |
| last_transfer_date | last_sale_date | only the latest transfer is kept by the county [V] |
| last_sales_amount | last_sale_price | |
| mail_addr_street, mail_city, mail_zip | owner_occupied_guess | normalize and compare to site address, then discard |
| foreclosure_flag | foreclosure_flag | 1 = flagged; 2,719 1-family [V] |
| total_net_delq_balance > 0 | tax_delinquent | used only as an exclusion option, never shown as a reason |
| homestead_flag | not used | Ohio homestead is a senior/disabled reduction [S]; never market on it |
| **DROP** | parcel_owner, second_owner, grantor, grantee, mail_name, lender, legal_description | |

- Sale events: when `last_transfer_date` is newer than the stored `last_sale_date`, insert `parcel_event(kind='sale', source='cuy_sales', source_record_id = parcel_id || ':' || date, amount = last_sales_amount, arms_length = last_sales_amount >= 10000)`.
- Sanity check [V]: 1,190 single-family sales over $50K recorded 2026-10-01 to 10-29; 840 built before 1960.

### 5.2 `cuy_parcel_geom`: centroids (weekly) [V]
- URL: `https://gis.cuyahogacounty.gov/server/rest/services/CCFO/Parcel_Fabric_Taxparcels/FeatureServer/0/query` key `PARCELPIN`; alternate `https://gis.cuyahogacounty.gov/server/rest/services/CCFO/Open_Data_Parcels/MapServer/0/query` key `parcelpin`.
- `outFields=PARCELPIN&returnGeometry=true&outSR=4326`. Compute `ST_PointOnSurface` and store in `parcel.geom`.
- Schedule: Sunday 03:00.

### 5.3 `cuy_canopy`: CCPC tree canopy + land cover per parcel (once, then yearly) [V]
- URL: `https://gis.cuyahogacounty.gov/server/rest/services/CCPC/UTC2019_Metrics_Final/MapServer/0/query` (layer `Parcels_UTC`; 484,989 rows; maxRecordCount 2000) [V].
- Key `PARCELPIN` (8 digits, same as parcel_id) [V]. Map `Can_P` -> canopy_pct, `Grass_P` -> grass_pct, `Imperv_P` -> impervious_pct.
- Schedule: on install; January 2 yearly.

### 5.4 `cuy_footprints` (optional, M3)
- `https://gis.cuyahogacounty.gov/server/rest/services/Hosted/2023_Building_Footprints/FeatureServer/0` (698,605 rows; fields objectid, height, SHAPE__Area) [V]. Spatial join to parcel polygons; store max height. Skip if short on time.
- Do not use `Hosted/Recreational_Pool_Locations_Public_view`: it returned no fields/count without a token [V].

### 5.5 `fema_flood` (monthly) [V]
- URL: `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query` (Flood Hazard Zones; fields FLD_ZONE, ZONE_SUBTY, SFHA_TF ...) [V].
- Query by county envelope (`geometry=xmin,ymin,xmax,ymax&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects`), `outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF`, `returnGeometry=true`, `outSR=4326`. Load into `flood_zone`, then `update parcel set flood_zone, in_sfha = (SFHA_TF = 'T')` via `ST_Intersects`.
- Schedule: 1st of month 01:00.

### 5.6 Cleveland open data (daily 05:00) [V]
Base: `https://services3.arcgis.com/dty2kHktVXHrqO8i/ArcGIS/rest/services/{SERVICE}/FeatureServer/0/query`
Cleveland keys use the same 8-digit Cuyahoga parcel number [V], so matching is exact by parcel id.

| Job | SERVICE | Key | Date | Mapping | Notes |
|---|---|---|---|---|---|
| cle_permits | Building_Permits | PARCEL_NUMBER | ISSUE_DATE | kind=permit; id=PERMIT_ID; raw_type = PERMIT_CATEGORY / PERMIT_TYPE / PERMIT_SUBTYPE; description = WORK_DESCRIPTION else JOB_DESCRIPTION; amount=JOB_VALUE; status=CURRENT_TASK_STATUS; contractor = CONTRATOR_BUSINESS_NAME (sic) else CONTRACTOR_NAME (flag is_individual); license = CONTRATOR_LICENSE_ID; source_url = ACCELA_CITIZEN_ACCESS_URL; geom = LON/LAT | 202,564 rows, 2015-01-02 to 2026-10-31 [V]. Oct 2026: 1,333 permits, 1,213 with a business name [V]. First load = full history |
| cle_violations | Complaint_Violation_Notices | PARCEL_NUMBER | ISSUE_DATE | kind=violation; id=V_PERMIT_ID; raw_type=TYPE_OF_VIOLATION; description = VIOLATION_CITATIONS + ADDITIONAL_CITATION_DETAILS; status=RECORD_STATUS; is_active = ACTIVE_VIOLATION; source_url=ACCELA_CITIZEN_ACCESS_URL | 61,615 rows; 805 issued Oct 2026 [V] |
| cle_rentals | Rental_Registrations | Parcel | File_Date | kind=rental_registration; id=Record_ID; set parcel.is_rental when Active_Registration_Current_Year is truthy | 97,872 rows [V]. **DROP** Owner_Name, Owner_Org_Name, Owner_Address, Local_Agent_In_Charge_*, Property_Management_* |
| cle_condemnations | Current_Condemnations | Parcel_Number | Condemnation_Date | kind=condemnation; is_active=Active_Condemnation | 2,623 rows [V]. Exclusion only |
| cle_demo | Demolition_Permits | PRIMARY_PARCEL | (layer date field) | kind=demolition | exclusion |
| cle_boardup | Boardup_Permits | PARCEL_NUMBER | (layer date field) | kind=boardup | exclusion |
| cle_coo | Certificates_of_Occupancy | Parcel | (layer date field) | kind=certificate_of_occupancy | M3 |
| cle_leadsafe | Lead_Safe_Certificates | PARCEL_NUMBER | (layer date field) | kind=lead_safe | painting signal, M3 |
| cle_disclosure | Certificates_of_Disclosure | PRIMARY_PARCEL | (layer date field) | kind=disclosure | M3 |
| cle_survey | Citywide_Property_Survey_2022 | parcelnumb_no_formatting | survey_created | write `parcel.survey_2022` = {roof, gutters, siding, windows, porch, chimney, driveway, garage, paint_peeling, grade} from survey_condition_* , survey_paintpeeling, survey_grade | One-time. Label reasons "2022 city survey". **DROP** owner, mailadd, careof, mail_* |
| cle_contractors | Active_Contractor_Registrations | n/a | n/a | seed contractor + alias tables | service exists [V]; read its fields on first run |

Services Demolition_Permits, Boardup_Permits, Certificates_of_Occupancy, Lead_Safe_Certificates, Certificates_of_Disclosure and Active_Contractor_Registrations exist [V]; their key field names in this table are [S]. For those layers and those marked "(layer date field)", read `?f=json` field list on first run and pick the date field; log it into `source.notes`.
Delta: `{DATE_FIELD} >= DATE '{max_seen - 7 days}'` (Cleveland backfills late).

### 5.7 `lake_parcels`: Lake County parcels + latest sale (daily 04:45) [V]
- URL: `https://gis.lakecountyohio.gov/arcgis/rest/services/GIS/GIS_Parcels_WGS84/FeatureServer/0/query` (114,622 rows; A_SALE_DATE to 2026-10-30) [V].
- Map: PIN_NODASH -> parcel_id; A_HOUSENO + A_ST_PREFIX + A_ST_NAME + A_ST_TYPE + A_ST_SUFFIX -> addr_line; A_UNITNUM -> addr_unit; A_USPS_CITY -> city; A_ZIPCODE -> zip; G_COMM -> municipality; A_ACRES -> lot_acres; A_VAL_TOTAL -> market_value; A_PROP_CLASS -> land_use_code; A_YEAR_BUILT -> year_built; G_X_COORD_DD / G_Y_COORD_DD -> geom; A_SALE_DATE + A_SALE_AMOUNT -> sale event (`lake_sales`, id = PIN_NODASH:date); owner_occupied_guess from A_O_HOUSENO/A_O_ST_NAME/A_O_ZIPCODE vs site.
- **DROP** A_OWNER_NAME, A_TAXP_NAME, A_SELLER, then all A_O_* and A_T_* after the compare.
- 773 parcels had A_SALE_DATE in 2026-10-01..10-30 (all classes) [V]. Ignore A_SALE_DATE = 1900-01-01.

### 5.8 `lake_permits_xlsx`: Lake County Building Inspection monthly report (weekly check, Mon 03:00) [V]
- Listing: `https://www.lakecountyohio.gov/building-inspection/monthly-permits/`. Parse links to `https://wpassets.lakecountyohio.gov/wp-content/uploads/sites/10/YYYY/MM/<id>/<N>-<Month>-YYYY-Monthly-Report.xlsx`.
- Columns [V]: Permit #, Issued Date, Use Code, Municipality, Permit Type, Job Description, Proposed Use, Site Address, Project Cost, Square Feet, Const Type, Parcel #, Applicant Name, DBA_NAME, DBA_PHONE.
- Map: id = Permit #; event_date = Issued Date; raw_type = Permit Type / Use Code / Proposed Use; description = Job Description; amount = Project Cost; parcel = Parcel # (strip dashes) matched to lake parcel; contractor = DBA_NAME (fallback Applicant Name only when it looks like a business: contains LLC, INC, CO, CORP, ROOF, HEAT, PLUMB, ELECTRIC, EXTERIOR, CONSTRUCTION, HOME); contractor.phone = DBA_PHONE.
- Coverage: only municipalities served by Lake County Building Inspection, not every Lake city [S]. July 2026: 568 rows, 485 residential; latest posted month on 2026-11-01 was July (about a 3-month lag) [V]. Hash each file; process once.

### 5.9 `medina_permits`: Medina County residential list (monthly) [V]
- URL: `https://building.co.medina.oh.us/permits/permitList.php?code=R` returns last month's residential permits as HTML (Oct 2026: 365) [V]. Date parameters are unreliable: take what it returns, dedupe by permit number.
- Table header cells are paired values [V]: `Issue Date/Est. Value`, `Permit#/PPN`, `Project Type/Location`, `Owner Name/Address`, `Contractor/Address`, `Electrical/Address`. Split each cell on `<br>`.
- Map: id = Permit#; parcel_raw = PPN; event_date = Issue Date; amount = Est. Value; raw_type = Project Type; address = Location; contractor = Contractor (name part only); electrical contractor appended to description. **DROP** Owner Name/Address.
- No Medina parcel layer has been verified yet. Create stub parcels `medina:{PPN}` with `data_limited = true`, geocoded with the US Census batch geocoder `https://geocoding.geo.census.gov/geocoder/locations/addressbatch` (free, no key) [S].
- Schedule: days 2, 5 and 10 of each month, 03:30.

### 5.10 `stark_sales` (daily 05:15) [V]
- URL: `https://scgisa.starkcountyohio.gov/arcgis/rest/services/Auditor/StarkCountySales/FeatureServer/0/query` (304,156 rows through 2026-10-29) [V].
- Fields [V]: PARID, SITE_ADDRESS, TRANSFER_DATE, SALE_PRICE, NUMBER_OF_PARCELS, ARMS_LENGTH ('Yes'/'No'), INSTR_TYPE_DESC, SALE_VALIDITY, SALE_TYPE, CONVEYANCE_NUMBER, INSTRUMENT_NUMBER. **DROP** FORMER_OWNER, NEW_OWNER.
- Oct 2026: 922 'Yes' and 930 'No' arms-length rows [V].
- Map: kind = sale; id = CONVEYANCE_NUMBER (fallback PARID:TRANSFER_DATE); arms_length = (ARMS_LENGTH = 'Yes'); stub parcel `stark:{PARID}` from SITE_ADDRESS + polygon centroid; `data_limited = true` (no year built/sqft in this layer).

### 5.11 `summit_permits` (M3, best effort)
- `https://permitsearch.summitoh.net/PermitResult?PermitNumber=BP26#####` [V for 2026 numbers]: sequential numbers; contractor often blank [V]. Summit moved to GovWell around 2026-09-25 [S], so this may stop updating. Walk forward from last seen at 1 request per 2 s; stop after 50 consecutive misses.
- Summit sales: the fiscal office "SC706" sales CSV at fiscaloffice.summitoh.net [S, confirm URL]. Do not use the token-protected ArcGIS Tax_Parcel_Sales layer.

### 5.12 `records_import`: ORC 149.43 request results (M3)
- Admin uploads CSV/XLSX/PDF per city per month at `/admin/imports`. CSV/XLSX: column-mapping UI (address, parcel, date, type, description, value, contractor), saved per city. PDF: `packages/ingest/py/pdf_tables.py` with pdfplumber -> CSV -> same mapping. `source = 'rr_{city}'`, owner columns dropped by mapping.

### 5.13 Daily job order
```
04:30 cuy_parcels      04:45 lake_parcels     05:00 cle_*          05:15 stark_sales
05:30 match            (retry unmatched_record)
05:40 signals          (recompute parcel_signal for parcels with new events/attrs)
05:50 score            (all orgs, incremental)
06:00 automail         (queue mail_pieces for new leads passing rules)
06:15 attribution
Mon 06:00 digest       (after score)
```

---

## 6. Address and parcel matching

Order (stop at first hit):
1. **Parcel id.** Strip non-alphanumerics, uppercase. Cuyahoga/Cleveland: 8 digits, left-pad zeros. Lake: PIN_NODASH. Confidence 1.00.
2. **Exact normalized address.** `addr_norm = house_no + ' ' + predir + ' ' + street + ' ' + suffix + '|' + zip5`, uppercase, USPS Publication 28 suffixes (AVENUE->AVE, STREET->ST, ROAD->RD, DRIVE->DR, BOULEVARD->BLVD, COURT->CT, LANE->LN, PLACE->PL, PARKWAY->PKWY, TERRACE->TER, CIRCLE->CIR), directions N/S/E/W/NE/NW/SE/SW, ordinal numbers kept (117TH), unit tokens removed (APT, UNIT, #, REAR, UP, DN). Confidence 0.95.
3. **Fuzzy.** Same house number + zip, `similarity(street) >= 0.8`, exactly one candidate. Confidence 0.80.
4. **Geo.** Source lat/lon within 30 m of a parcel centroid with the same house number. Confidence 0.70.
5. Else `unmatched_record`; retry daily for 14 days, then show at `/admin/unmatched`.

Required unit cases: `1234 W. 117th Street` = `1234 W 117TH ST`; `12 Ave` is not `12th Ave`; ranges `1234-1236 MAIN ST` match on 1234; zip 44107 (int) = '44107'; `ST. CLAIR AVE` = `ST CLAIR AVE`; `MT VERNON` vs `MOUNT VERNON` (alias table).

---

## 7. Scoring engine (`packages/scoring`)

Pure TypeScript, no I/O. Input: parcel row + its signals + org profile. Output: `{ score, reasons[], pitch, trigger }`.

### 7.1 Formula
```
for each signal s in template (key, weight w, user multiplier m in {0, 0.5, 1, 1.5, 2}, learned l in [0.8, 1.25]):
  value v_s in [0, 1]           # from parcel_signal
raw   = sum(w * m * l * v_s) / sum(w * m * l)       # 0..1
boost = max(trigger boosts that fired in last 30 days) # 0..15 points
score = clamp(round(100 * raw + boost), 0, 100)
```
Hard filters (year_built_max, price band, lot min, gas, owner_occupied, zips) and exclusions (rentals, condos, condemned, demolished, boarded, org_suppression, global suppression, tax_delinquent if chosen) are applied **before** scoring. A home appears as a lead only when `score >= template.threshold` (default 55) or a trigger fired.

Reasons: top 3-5 signals by `w*m*l*v`, each with plain-English label and evidence, e.g. `{"key":"last_permit_age:roofing","label":"No roof permit on record since 2003 (23 yrs)","evidence":{"event_id":123,"date":"2003-06-11","url":"https://..."}}`.

### 7.2 Signal library (computed in the `signals` job into `parcel_signal`)
| Key | Value 0..1 | Source |
|---|---|---|
| new_owner | 1 if sold <= 30 days; linear to 0 at 365 days | sale events |
| home_age | (2026 - year_built) / 100, capped 1 | parcel |
| era_pre1950 | 1 if year_built < 1950 | parcel |
| no_recent_permit:{cat} | 1 if no permit in category in 15 yrs (Cleveland: data since 2015, so "none since 2015") | events |
| last_permit_age:{cat} | years since last permit / category lifespan, capped 1; if none, use home age | events |
| price_band | 1 inside user band, 0.5 within 20 percent, else 0 | market_value or last_sale_price |
| lot_size | percentile of lot_acres within the org's territory | parcel |
| canopy | canopy_pct / 60, capped 1 | CCPC |
| grass | grass_pct / 60, capped 1 | CCPC |
| living_area | percentile of living_sqft | parcel |
| no_gas | 1 if gas_service = false | parcel |
| well_water | 1 if water_source = PVT | parcel |
| septic | 1 if sewer_type in (SP, SPS) [S] | parcel |
| flood | 1 if in_sfha; 0.5 if zone X shaded | FEMA |
| owner_occupied | 1 if owner_occupied_guess | parcel |
| active_violation:{cat} | 1 if open violation mapped to category within 365 days | Cleveland violations |
| survey_condition:{part} | Poor 1, Fair 0.6, Good 0 (2022) | Cleveland survey |
| neighbor_job:{cat} | 1 if >= 2 permits in category within 150 m in last 60 days | events + geom |
| condo | 1 if condo land use | parcel (used as exclusion) |

### 7.3 Permit/violation category mapping (`templates/categories.yaml`)
Regex against `raw_type + ' ' + description`, case-insensitive, first match wins, order as listed:
```yaml
demolition:  '\b(demo|demolition|raze)\b'
roofing:     '\b(roof|re-?roof|shingle|tear ?off)\b'
hvac:        '\b(furnace|hvac|a/?c|air condition|heat pump|boiler|mini.?split|ductwork|mechanical)\b'
plumbing:    '\b(plumb|water heater|sewer line|drain|backflow|fixture)\b'
electrical:  '\b(electric|service upgrade|panel|amp service|ev charger|generator|wiring)\b'
waterproof:  '\b(waterproof|basement wall|sump|drain tile|foundation repair)\b'
siding:      '\b(siding|vinyl|hardie)\b'
windows:     '\b(window|door replacement)\b'
gutters:     '\b(gutter|downspout)\b'
painting:    '\b(paint|lead safe|lead abatement)\b'
concrete:    '\b(driveway|concrete|apron|flatwork|sidewalk)\b'
fence_deck:  '\b(fence|deck|porch)\b'
garage:      '\bgarage\b'
pool:        '\b(pool|spa|hot tub)\b'
tree:        '\b(tree|stump)\b'
remodel:     '\b(kitchen|bath|remodel|alteration|addition|renovat)\b'
```
Tests: 50 real Cleveland permit descriptions per category in fixtures, at least 90 percent correct.

### 7.4 Template file format (`templates/roofing.yaml`)
```yaml
key: roofing
version: 1
label: Roofing
threshold: 55
signals:
  last_permit_age:roofing: { weight: 30, lifespan_years: 22 }
  no_recent_permit:roofing: { weight: 15 }
  home_age: { weight: 15 }
  new_owner: { weight: 15 }
  canopy: { weight: 8 }
  survey_condition:roof: { weight: 10 }
  active_violation:roofing: { weight: 7 }
  neighbor_job:roofing: { weight: 10 }
triggers:
  - { kind: sale, within_days: 30, boost: 10, label: "Just sold" }
  - { kind: neighbor_job, category: roofing, within_days: 60, boost: 8, label: "Neighbors re-roofing" }
  - { kind: violation, category: roofing, within_days: 90, boost: 12, label: "City roof citation" }
default_filters: { year_built_max: null, owner_occupied: true }
default_exclusions: { rentals: false, condos: true, condemned: true }
pitch: "Built {year_built}. {top_reason}. A free roof check before winter is an easy yes."
```

### 7.5 The 13 v1 templates (weights; M1 ships the first 6)
| Trade | Main signals (weight) | Triggers | Default filters |
|---|---|---|---|
| roofing | last roof permit age 30 (22y), no recent 15, age 15, new owner 15, canopy 8, survey roof 10, violation 7, neighbor 10 | sale, neighbors, citation | condos out |
| hvac | last hvac permit age 30 (18y), new owner 20, age 15, no_gas 10 (heat pump pitch), living area 10, owner occ 10 | sale, neighbors | owner occupied |
| plumbing | era_pre1950 20, last plumbing age 20 (25y), new owner 20, age 15, well_water 5, flood 10, violation 10 | sale, citation | |
| electrical | era_pre1950 25, last electrical age 25 (35y), new owner 20, living area 10, garage (EV) 10, violation 10 | sale | |
| lawn_care | grass 30, lot size 25, new owner 20, price band 15, owner occ 10 | sale | lot >= 0.15 ac |
| tree | canopy 40, lot size 20, new owner 15, neighbor tree 10, age 15 | sale, storm (manual) | canopy >= 25 |
| painting | era_pre1950 20, survey paint/siding 25, new owner 20, violation 20, no paint permit 15 | sale, citation | |
| gutters | canopy 30, survey gutters 20, age 15, new owner 20, neighbor 15 | sale | |
| siding | survey siding 25, last siding age 25 (30y), age 20, new owner 15, violation 15 | sale, citation | |
| remodel | new owner 35, price band 25, living area 15, last remodel age 15, owner occ 10 | sale | price >= 150k |
| pest | era_pre1950 20, canopy 20, new owner 30, flood 10, violation 20 | sale | |
| septic | septic 60 [S], new owner 25, age 15 | sale | sewer in SP/SPS |
| waterproofing | flood 30, era_pre1950 20, new owner 20, last waterproof age 15, neighbor 15 | sale, neighbors | |

### 7.6 Feedback loop
Nightly per org, per signal key, over leads with outcome (won/lost/skipped, skipped counts as 0.5 lost):
`learned = clamp(1 + 0.25 * (mean_v_won - mean_v_lost), 0.8, 1.25)`. Apply only after 10 outcomes. Show in Settings: "We nudged 'canopy' up because your wins have more trees." Allow reset.

### 7.7 Performance
Signals are materialized; scoring an org of 50K parcels must finish in under 5 seconds in a single SQL + TS pass (stream rows, score in memory, bulk upsert leads where score changed by 3+ points or crossed threshold).

---

## 8. API (Next.js route handlers; all JSON; zod-validated; org from session)

| Method + path | Purpose |
|---|---|
| GET /api/leads?status&min_score&trigger&zip&q&sort&cursor | Lead list (paged 50) |
| GET /api/leads/:id | Lead detail: parcel facts, reasons, events timeline, notes, mail pieces |
| PATCH /api/leads/:id | status, won_amount, lost_reason, hidden |
| POST /api/leads/:id/notes | add note |
| GET /api/leads/export.csv | CSV: address, city, zip, score, reasons, status. Never names |
| GET /api/map/points?bbox&min_score | GeoJSON of the org's leads |
| GET /api/map/heat?bbox&kind&category&days | H3/grid aggregate of events (counts only) |
| GET /api/parcels/search?q | address search within territory |
| GET /api/parcels/:key/neighbors?radius_m=150&limit=40 | neighbor ring around a won/active job |
| POST /api/parcels/:key/neighbors/mail | mail the ring (goes through 10.3 checks) |
| GET /api/competitors?days=90 | contractors pulling permits in territory: name, count, categories, recent addresses |
| GET /api/roi?from&to | metrics + attribution rows |
| GET/PUT /api/settings/profile | scoring profile |
| GET/POST/DELETE /api/settings/territories | territories (exclusivity check on POST) |
| GET/PUT /api/settings/org | branding, digest emails, return address |
| POST /api/settings/suppression/upload | current-customer CSV |
| GET/POST/PUT /api/mail/templates | postcard templates |
| POST /api/mail/preview | provider proof PDF URL |
| POST /api/mail/send | lead_ids[] + template_id, returns cost preview unless confirm=true |
| DELETE /api/mail/pieces/:id | cancel before send_after |
| GET/PUT /api/mail/rules | auto-mail rules |
| GET /api/mail/pieces | mail history |
| POST /api/billing/checkout, POST /api/billing/portal | Stripe |
| POST /api/webhooks/stripe, /lob, /postgrid, /resend | signed webhooks |
| POST /api/public/optout | homeowner opt-out (Turnstile) |
| POST /api/public/sample | marketing sample request (Turnstile) |
| POST /api/cron/:job | bearer CRON_SECRET |
| GET /admin/jobs, /admin/unmatched, /admin/imports, /admin/orgs | admin (ADMIN_EMAILS) |

---

## 9. UI and UX

Design system [J]: Navy `#0F2A44` (primary), Signal Orange `#F26B1D` (accent, CTAs, score chips >= 80), Paper `#F7F5F0` (background), Slate `#4A5563` (text secondary), Green `#2E7D4F` (won), Red `#B42318` (lost/alerts). Type: Inter (UI), JetBrains Mono (numbers, addresses). 8 px spacing grid, 12 px radius, 44 px minimum tap targets. Plain language: "homes", never "records" or "parcels" in the UI.

Mobile first. Bottom tab bar on phones (Leads, Map, Mail, ROI, Settings); left sidebar on desktop.

### 9.1 Onboarding (5 steps, under 3 minutes, progress dots)
1. **Your trade.** Grid of 13 trade tiles with icons. Pick one (more trades = add-on later).
2. **Your area.** Type zips or towns, or tap them on a map. Each chip shows a live count: "44107 Lakewood: 214 homes match this week". Exclusive plan shows a lock badge on taken zips ("Taken for roofing") and an "available" badge on open ones.
3. **Your perfect customer.** All optional, pre-filled from the template:
   - Home age: segmented [Any | 30+ yrs | 50+ yrs | Pre-1950]
   - Home value: two-handle slider ($50K to $1M+)
   - Lot size: segmented [Any | 1/4 ac+ | 1/2 ac+ | 1 ac+]
   - Heat: [Any | Gas | No gas line]
   - Owner-occupied only: toggle
   - "What matters most": 3 sliders mapped to the top template signals (e.g. Roof age / Just moved in / Trees), 0 to 2x
   - Exclusions: rentals, condos, streets, "upload my current customers" CSV
   - Live preview panel: 5 sample homes with score and reasons that update as controls move (debounced 300 ms).
4. **Your brand.** Logo upload, phone, website, default offer ("$150 off a full roof replacement"). Shown on a postcard preview.
5. **Plan.** Three cards; trial starts with no card. Then land on Leads with 3 coach marks: score chip, "why this home", status pill.

### 9.2 Leads (list)
- Sticky top: search, filter chips (Score 70+, Just sold, Neighbors, Citation, New this week), sort (score, newest trigger, value).
- Card (mobile): address (mono), town, score chip, trigger pill ("Sold 6 days ago"), 2 reasons as text, status pill, quick actions (Contacted, Mail, Skip). Swipe right = contacted, left = skip.
- Desktop: dense table with the same columns, checkbox multi-select, bulk "Mail selected" and "Export CSV".
- Empty state: explain when new data lands ("Cuyahoga sales update daily; Lake permits monthly").

### 9.3 Map
- MapLibre with lead pins colored by score. Layers: Leads, Recent permits (by category), Sales, Violations, Flood zones, Heat.
- Lasso/draw tool -> "Mail these 37 homes" with cost preview.
- Neighbor-ring mode: tap a won job, see a 150 m ring of homes with counts and "Mail the ring".

### 9.4 Lead detail
- Header: address, score, status selector, Mail button.
- **Why this home**: 3-5 reasons with icons, each linking to evidence (permit page via `source_url`, sale date, survey year).
- Suggested pitch (copy button).
- Facts grid: year built, sqft, style, lot, value, last sale (date + price), heat (gas/no gas), water/sewer, canopy %, flood zone.
- Timeline: every public event at this address (permits with contractor business name, sales, violations), plus our mail pieces and notes.
- Notes box. Won flow asks job amount; lost flow asks reason (price, timing, competitor, no response).
- Optional Street View thumbnail (only if org enabled it; Google ToS caching rules apply). Never Zillow/MLS photos.

### 9.5 Postcard builder (Mail tab)
- 3 system templates per trade (front image + headline, back offer + map pin + phone + QR to their site with UTM).
- Fields: headline, offer, expiry, phone, URL, logo. Live front/back preview; "Get proof PDF" from provider.
- Addressing is always "Current Resident" plus address. Back footer includes return address and small print: "Based on public records. To stop mail: 216labs.dev/leads/optout".
- Send screen: N homes, M removed by suppression/30-day rule, cost (credits first, then $0.99 each), expected delivery window, 15-minute undo.
- Auto-mail card: toggle, "Mail every new home scoring 70+ that just sold", weekly cap, monthly $ cap, optional follow-up on day 21.

### 9.6 ROI dashboard
- Metrics: homes surfaced, contacted, mailed, quotes, jobs won, revenue won, cost (subscription + postcards), ROI multiple.
- "Proof from public records" table: homes you mailed that later pulled a permit in your category (you or a competitor, with business name and date).
- Monthly line chart: mailed vs won. Downloadable monthly PDF.

### 9.7 Settings
Profile (perfect customer), Territories, Brand, Mail rules, Team (invite by email), Billing (Stripe portal), Digest (recipients, day), Data coverage page per town (which sources, freshness).

### 9.8 Marketing site
Hero "Know which homes need you next." with a live counter (e.g. single-family sales this month in Cuyahoga). Sample page per trade+zip with real counts and masked house numbers ("12xx W 117th St"). Pricing, coverage map, how it works, FAQ, privacy, terms, homeowner opt-out.

### 9.9 Components
ScoreChip, TriggerPill, ReasonList, StatusPill, LeadCard, LeadTable, FilterBar, TerritoryPicker, WeightSlider, SegmentedControl, PostcardPreview, CostPreview, MapView, NeighborRing, Timeline, MetricTile, EmptyState, CoachMark, PlanCard.

---

## 10. Print and mail

### 10.1 Interface
```ts
interface MailProvider {
  createPostcard(p: { idempotencyKey: string; to: Address; from: Address; frontHtml: string; backHtml: string;
                      mergeVariables: Record<string,string>; size: '4x6'|'6x9'; sendDate?: string }): Promise<{ id: string; expectedDelivery?: string; costCents?: number }>;
  cancel(id: string): Promise<void>;
  proof(input: ...): Promise<{ pdfUrl: string }>;
  verifyWebhook(req: Request): Promise<MailEvent>;
}
```
### 10.2 Lob
- `POST https://api.lob.com/v1/postcards` with `Idempotency-Key: mail_piece.id`, `to.name = "Current Resident"`, `send_date = now + 15 min` so users can cancel.
- Webhooks: map postcard.created/rendered -> submitted, mailed, in_transit, in_local_area, processed_for_delivery -> delivered (estimated), re-routed, returned_to_sender -> returned (add to suppression with reason returned_mail).
- Pricing on 11/01/2026 for 4x6 First Class [V]: Developer $0.909/piece (no platform fee, about 500/mo cap); Startup $0.649 + $260/mo; Growth $0.619 + $550/mo. Switch to Startup at about 1,000 cards/mo.
- PostGrid fallback: Starter 4x6 First Class $0.902 [V].

### 10.3 Pre-send checks (in this order, each removal counted on the send screen)
1. Parcel in org territory. 2. Not in global `suppression`. 3. Not in `org_suppression` or org exclusions. 4. Not mailed by this org in the last 30 days. 5. Org has credits or an active payment method and is under monthly cap. 6. Address is complete (number, street, city, zip).

### 10.4 Billing
Use credits first (`usage_ledger credit_use`), then report Stripe meter events (`STRIPE_METER_POSTCARDS`, value 1 per piece) at $0.99. Store `cost_cents` (provider) and `price_cents` (ours).

---

## 11. Stripe

| Plan | Monthly | Annual (2 months free) | Includes |
|---|---|---|---|
| Starter | $99 | $990 | 1 trade, up to 3 zips, list + digest + tracker + CSV |
| Pro | $199 | $1,990 | up to 10 zips, map, neighbor ring, competitor tracker, auto-mail, ROI, 50 postcard credits/mo |
| Exclusive | $349 | $3,490 | Pro + exclusivity in up to 5 zips for their trade, 150 credits/mo, 4 users |

Postcards beyond credits: $0.99 metered. Trial: 14 days, no card, 25 free postcards when they add a card. Founding offer: Pro at $149/mo locked for the first 20 customers (coupon). Guarantee copy: "If you don't book a job from 216 Leads in your first 60 days, we refund month 2."
Webhooks: checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid (grant monthly credits), invoice.payment_failed (banner + 7-day grace).

---

## 12. Email

- Monday 06:00 ET digest: subject "{n} homes in {top town} need a {trade} this week". Body: top 10 leads (address, score, one reason, trigger), counts by trigger, competitor of the week (business name + count), one-tap links. Plain, mobile, under 100 KB.
- Transactional: magic link, welcome, trial ending (day 11), payment failed, mail batch confirmation, auto-mail weekly summary.
- Sending domain: `mail.216labs.dev` with SPF, DKIM, DMARC (p=quarantine after 2 weeks). List-Unsubscribe headers on the digest. Footer: "216LABS LLC, 1474 Rosewood Ave, Lakewood, OH 44107".
- Never send cold outreach from the product domain. Cold email lives on a separate domain and inbox provider, and is not part of this codebase.

---

## 13. Auth, tenancy, exclusivity, limits

- Supabase Auth; org created at onboarding; owner invites members.
- All tenant queries go through RLS; parcel data only via territory-checked server code (404 outside territory).
- Exclusivity: on Exclusive plan, POST territory zip -> insert `exclusivity_lock(trade, zip)`; conflict = 409 "Taken". Non-exclusive orgs in a locked trade+zip get `lead.visible_from = first_surfaced_at + 72 hours` and are never auto-mailed before that.
- Rate limits: 60 req/min per user on API; CSV export max 2,000 rows/day per org; map points max 5,000 per request.
- Admin: ADMIN_EMAILS only; impersonation read-only with audit log.

---

## 14. Compliance and privacy (build these in, they are not optional)

- **No owner names** in DB columns, exports, UI, postcards or emails. Mail is to "Current Resident" [J].
- No contact appends (no phone or email lookups on homeowners), no SMS, no calls to homeowners. The product does not offer them.
- Global homeowner opt-out at `/optout` (address + Turnstile) -> `suppression`; honored by every org within 2 business days. Returned mail auto-suppresses.
- Contractors are shown by business name from public permits; when a contractor name looks like an individual person, show "Independent contractor" instead.
- Disclaimer in footer and exports: "Built from public records. May be incomplete or out of date. Not a consumer report; do not use for credit, insurance, employment or housing decisions."
- Scrape politely: 1 request/second per host, identifying UA, honor robots.txt for HTML pages, no login or captcha pages.
- Do not market on homestead (senior/disabled) or foreclosure flags; these exist only as exclusions.
- Data retention: raw payloads 180 days; events kept indefinitely; deleted org data purged in 30 days.

---

## 15. Tests, seed data, acceptance

Seed: `pnpm db:seed` loads fixtures (2,000 Cuyahoga parcels in 44107 and 44111, 500 Cleveland permits, 100 violations, 50 sales) and a demo org "Demo Roofing" with territories 44107, 44111.

Tests: address normalizer (section 6 cases), category regex (7.3), scoring determinism (snapshot of 20 parcels), RLS (user A cannot read org B leads, cannot fetch a parcel outside territory), webhook signature checks, mail pre-send checks, Playwright: onboarding -> lead list -> mark won -> ROI shows it.

### M1 acceptance
- [ ] Full Cuyahoga + Cleveland ingest completes; a second run upserts 0 changed rows.
- [ ] At least 99 percent of Cleveland permits match a parcel (they share parcel numbers).
- [ ] No owner-name strings in any table (test greps the DROP field values from a fixture).
- [ ] Onboarding under 3 minutes on a phone; live counts appear.
- [ ] Lead detail shows at least 3 reasons with working evidence links.
- [ ] Monday digest renders in Gmail and Apple Mail; Stripe checkout and portal work in test mode.
- [ ] Lighthouse mobile performance 85+ on Leads.

### M2 acceptance
- [ ] Lob test-mode postcard created, proof viewable, webhook updates status; cancel within 15 minutes works.
- [ ] Auto-mail respects caps, 30-day rule and suppression.
- [ ] Neighbor ring and competitor tracker return correct counts against fixtures.
- [ ] Lake, Stark, Medina jobs run; exclusivity 409 and 72-hour delay work.

### M3 acceptance
- [ ] Attribution links a later permit at a mailed home to won_self or lost_competitor.
- [ ] ROI PDF downloads. Records importer maps a sample CSV and PDF. Opt-out removes a home everywhere.

---

## 16. Do-not list

- Do not store or show owner names. Do not buy or append homeowner phones/emails. Do not build SMS or dialer features.
- Do not use Zillow, Redfin, Realtor.com or MLS photos/data.
- Do not bypass captchas, logins, or ArcGIS tokens.
- Do not send cold email from the app domain.
- Do not build invoicing, scheduling, estimates or dispatch.
- Do not hard-code weights in code; everything lives in template YAML + org profile.

---

## 17. Running costs (list prices, re-check before launch) [J]

| Item | 10 customers | 50 customers | 200 customers |
|---|---|---|---|
| Vercel Pro | $20 | $20 | $20-40 |
| Supabase Pro (+compute) | $25 | $25-75 | $110-200 |
| Fly.io worker | $5-10 | $10-20 | $30 |
| Resend | $0-20 | $20 | $20-90 |
| Map tiles | $0 | $0-25 | $25-100 |
| Sentry | $0 | $26 | $26-80 |
| Lob platform fee | $0 (Developer) | $260 (Startup, once >1,000 cards/mo) | $260-550 |
| Domains/Workspace | $20 | $20 | $30 |
| **Approx. fixed total** | **~$80/mo** | **~$400/mo** | **~$510-1,100/mo** |

Postcard print+postage is pass-through cost per piece ($0.62-$0.91) recovered by the $0.99 price.
