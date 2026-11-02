-- Spec 7.7: scoring an org of 50K homes in under 5 s. The 0006 version tested every parcel
-- against the org's territories (a 1.2 s scan of all 572K parcels, three times per score run).
-- One indexed lookup per territory kind instead.
create or replace function org_territory_parcels(o uuid) returns setof text language sql stable as $$
  select p.parcel_key from territory t join parcel p on p.zip = t.zip
    where t.org_id = o and t.kind = 'zip'
  union
  select p.parcel_key from territory t join parcel p on p.municipality_id = t.municipality_id
    where t.org_id = o and t.kind = 'municipality'
  union
  select p.parcel_key from territory t join parcel p on st_contains(t.geom, p.geom)
    where t.org_id = o and t.kind = 'polygon';
$$;
