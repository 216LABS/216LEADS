-- Per-town data coverage. Scoring treats permit/violation signals as unknown (not zero)
-- in towns with no public permit data, and the Settings > Data coverage page reads these.
alter table municipality
  add column permits_source text,          -- e.g. 'cle_permits', 'lake_permits_xlsx', 'medina_permits'
  add column permits_since int,            -- first year of permit data
  add column has_violations boolean not null default false,
  add column has_survey boolean not null default false;

-- Homes we score: residential land use (Ohio class 51x/52x/53x/55x), or limited-data stubs
-- created from residential permit/sale lists.
create or replace function is_residential(luc text, data_limited boolean) returns boolean
language sql immutable as $$
  select coalesce(luc ~ '^5[1235]', false) or (luc is null and data_limited);
$$;

-- Parcel keys in an org's territory, for server code on the direct connection
-- (callers resolve org membership from the session first).
create or replace function org_territory_parcels(o uuid) returns setof text
language sql stable as $$
  select p.parcel_key from parcel p
  where exists (
    select 1 from territory t where t.org_id = o and (
      (t.kind = 'zip' and t.zip = p.zip) or
      (t.kind = 'municipality' and t.municipality_id = p.municipality_id) or
      (t.kind = 'polygon' and st_contains(t.geom, p.geom))));
$$;

-- Event-derived exclusion flags and recent sale lookups are frequent.
create index pe_parcel_kind_idx on parcel_event (parcel_key, kind, event_date desc);
create index parcel_signal_key_idx on parcel_signal (key);
create index parcel_land_use_idx on parcel (land_use_code);
