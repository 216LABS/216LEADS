-- Public-record tables. No direct client access (see 0005_rls.sql).

create table county (
  code text primary key,              -- 'cuyahoga','lake','stark','medina','summit'
  name text not null
);

insert into county (code, name) values
  ('cuyahoga', 'Cuyahoga'), ('lake', 'Lake'), ('stark', 'Stark'),
  ('medina', 'Medina'), ('summit', 'Summit');

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
  addr_norm text not null,
  geom geometry(Point, 4326),
  land_use_code text,
  land_use_desc text,
  is_single_family boolean,
  is_condo boolean not null default false, -- 216 HomeSignal addition: derived from land use
  year_built int,
  living_sqft int,
  rooms int,
  style text,
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
  survey_2022 jsonb,
  data_limited boolean not null default false,
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
  is_individual boolean not null default false, -- never displayed by name
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
  source text not null,
  source_record_id text not null,
  event_date date not null,
  category text,
  raw_type text,
  description text,
  amount int,
  contractor_id bigint references contractor(id),
  status text,
  is_active boolean,
  arms_length boolean,
  source_url text,
  geom geometry(Point, 4326),
  match_method text,                  -- parcel_id | address_exact | address_fuzzy | geo
  match_confidence numeric(3,2),
  raw_ref text,
  ingested_at timestamptz not null default now(),
  unique (source, source_record_id)
);
create index pe_parcel_idx on parcel_event (parcel_key, event_date desc);
create index pe_kind_idx on parcel_event (kind, event_date desc);
create index pe_cat_idx on parcel_event (category, event_date desc);
create index pe_contractor_idx on parcel_event (contractor_id, event_date desc);
create index pe_geom_gix on parcel_event using gist (geom);

create table parcel_signal (
  parcel_key text not null references parcel(parcel_key) on delete cascade,
  key text not null,
  value numeric(5,4) not null,
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
