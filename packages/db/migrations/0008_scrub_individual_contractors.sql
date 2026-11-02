-- Never keep a person's name for a contractor: a homeowner who pulls their own permit is
-- listed in the city's contractor-name field. Individuals are kept by license number only.
-- Merge duplicate individuals that share a license onto one row first.
with ranked as (
  select id, license_id, min(id) over (partition by upper(license_id)) as keep_id
  from contractor where is_individual and license_id is not null
)
update parcel_event e set contractor_id = r.keep_id
from ranked r where e.contractor_id = r.id and r.id <> r.keep_id;

delete from contractor_alias a using contractor c where a.contractor_id = c.id and c.is_individual;

delete from contractor c using (
  select id, min(id) over (partition by upper(license_id)) as keep_id
  from contractor where is_individual and license_id is not null
) r where c.id = r.id and r.id <> r.keep_id;

update parcel_event set contractor_id = null
where contractor_id in (select id from contractor where is_individual and license_id is null);
delete from contractor where is_individual and license_id is null;

update contractor set name_norm = 'INDIVIDUAL ' || upper(license_id), display_name = 'Independent contractor'
where is_individual;

-- Unmatched-record payloads kept the raw contractor-name field.
update unmatched_record set payload = payload - 'CONTRACTOR_NAME' where payload ? 'CONTRACTOR_NAME';
