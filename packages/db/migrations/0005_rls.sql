create or replace function is_org_member(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_member m where m.org_id = o and m.user_id = auth.uid());
$$;

alter table org enable row level security;
create policy org_rw on org for all using (is_org_member(id)) with check (is_org_member(id));

do $$
declare t text;
begin
  foreach t in array array['org_member','org_invite','territory','scoring_profile','org_suppression','lead',
    'lead_note','lead_activity','mail_rule','mail_piece','attribution','digest_send','usage_ledger']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all using (is_org_member(org_id)) with check (is_org_member(org_id))',
                   t || '_rw', t);
  end loop;
end $$;

alter table postcard_template enable row level security;
create policy pt_read on postcard_template for select using (org_id is null or is_org_member(org_id));
create policy pt_write on postcard_template for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- Public-record and bookkeeping tables: server code only (service role / direct connection).
do $$
declare t text;
begin
  foreach t in array array['county','municipality','parcel','parcel_event','parcel_signal','contractor',
    'contractor_alias','unmatched_record','flood_zone','source','job_run','exclusivity_lock',
    'suppression','prospect_request']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;

create or replace function org_parcel_keys(o uuid) returns setof text
language sql stable security definer set search_path = public as $$
  select p.parcel_key from parcel p
  where is_org_member(o) and exists (
    select 1 from territory t where t.org_id = o and (
      (t.kind = 'zip' and t.zip = p.zip) or
      (t.kind = 'municipality' and t.municipality_id = p.municipality_id) or
      (t.kind = 'polygon' and st_contains(t.geom, p.geom))));
$$;

-- Server-side twin of org_parcel_keys for code that runs on the direct connection
-- (no auth.uid()); callers must already have resolved org membership from the session.
create or replace function org_parcel_in_territory(o uuid, k text) returns boolean
language sql stable as $$
  select exists (
    select 1 from parcel p join territory t on t.org_id = o
    where p.parcel_key = k and (
      (t.kind = 'zip' and t.zip = p.zip) or
      (t.kind = 'municipality' and t.municipality_id = p.municipality_id) or
      (t.kind = 'polygon' and st_contains(t.geom, p.geom))));
$$;
