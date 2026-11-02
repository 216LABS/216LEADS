// `signals` job: materialize event-derived signals into parcel_signal (spec 7.2).
// Attribute signals (home age, canopy, gas, ...) are computed by the scoring engine from
// the parcel row, so only signals that need event history live here:
//   last_permit:{cat}      latest permit per category (engine turns it into last_permit_age / no_recent_permit)
//   active_violation:{cat} open city citation in the last 365 days
//   neighbor_job:{cat}     >= 2 permits in the category within 150 m in the last 60 days
//   excl:condemned / excl:demolished / excl:boarded   exclusion flags
import type { Sql } from "@216leads/db";
import { withJobRun } from "./runtime";

const TODAY = `(now() at time zone 'America/New_York')::date`;

export async function runSignals(sql: Sql) {
  return withJobRun(sql, { job: "signals" }, async (ctx) => {
    await sql.begin(async (tx) => {
      await tx`delete from parcel_signal where key like 'last_permit:%'`;
      const a = await tx.unsafe(`
        insert into parcel_signal (parcel_key, key, value, evidence)
        select distinct on (e.parcel_key, e.category)
          e.parcel_key, 'last_permit:' || e.category,
          least(1, greatest(0, (extract(year from ${TODAY}) - extract(year from e.event_date)) / 25.0)),
          jsonb_strip_nulls(jsonb_build_object(
            'event_id', e.id, 'date', e.event_date, 'url', e.source_url, 'source', e.source,
            'contractor', case when c.is_individual then 'Independent contractor' else c.display_name end))
        from parcel_event e left join contractor c on c.id = e.contractor_id
        where e.kind = 'permit' and e.parcel_key is not null and e.category is not null
        order by e.parcel_key, e.category, e.event_date desc, e.id desc`);
      ctx.meta.last_permit = a.count;

      await tx`delete from parcel_signal where key like 'active_violation:%'`;
      const b = await tx.unsafe(`
        insert into parcel_signal (parcel_key, key, value, evidence)
        select distinct on (e.parcel_key, e.category)
          e.parcel_key, 'active_violation:' || e.category, 1,
          jsonb_strip_nulls(jsonb_build_object('event_id', e.id, 'date', e.event_date, 'url', e.source_url, 'source', e.source))
        from parcel_event e
        where e.kind = 'violation' and e.is_active and e.parcel_key is not null and e.category is not null
          and e.event_date >= ${TODAY} - 365
        order by e.parcel_key, e.category, e.event_date desc, e.id desc`);
      ctx.meta.active_violation = b.count;

      await tx`delete from parcel_signal where key like 'neighbor_job:%'`;
      const c = await tx.unsafe(`
        insert into parcel_signal (parcel_key, key, value, evidence)
        select p.parcel_key, 'neighbor_job:' || r.category, 1,
          jsonb_build_object('count', count(*), 'date', max(r.event_date),
                             'event_id', (array_agg(r.id order by r.event_date desc, r.id desc))[1],
                             'url', (array_agg(r.source_url order by r.event_date desc, r.id desc))[1])
        from parcel_event r
        join parcel p on p.geom && st_expand(r.geom, 0.0025)
          and st_dwithin(p.geom::geography, r.geom::geography, 150)
          and p.parcel_key is distinct from r.parcel_key
          and is_residential(p.land_use_code, p.data_limited)
        where r.kind = 'permit' and r.category is not null and r.geom is not null
          and r.event_date >= ${TODAY} - 60
        group by p.parcel_key, r.category
        having count(*) >= 2`);
      ctx.meta.neighbor_job = c.count;

      await tx`delete from parcel_signal where key like 'excl:%'`;
      const d = await tx.unsafe(`
        insert into parcel_signal (parcel_key, key, value, evidence)
        select parcel_key, key, 1, jsonb_build_object('event_id', max(id), 'date', max(event_date))
        from (
          select parcel_key, 'excl:condemned' as key, id, event_date from parcel_event
            where kind = 'condemnation' and is_active and parcel_key is not null
          union all
          select parcel_key, 'excl:demolished', id, event_date from parcel_event
            where kind = 'demolition' and parcel_key is not null and event_date >= ${TODAY} - 365 * 5
              and coalesce(raw_type, '') !~* '(garage|accessory|shed|partial)'
          union all
          select parcel_key, 'excl:boarded', id, event_date from parcel_event
            where kind = 'boardup' and parcel_key is not null and event_date >= ${TODAY} - 365 * 2
        ) f
        group by parcel_key, key`);
      ctx.meta.exclusion_flags = d.count;
      ctx.rowsUpserted = a.count + b.count + c.count + d.count;

      // Population averages used when a home's town lacks the data (see 0007_signal_prior.sql).
      await tx`delete from signal_prior`;
      const pr = await tx.unsafe(`
        with res as (
          select p.parcel_key, p.canopy_pct, p.grass_pct, p.in_sfha, p.flood_zone, p.survey_2022,
            m.permits_source is not null as cov_permits, coalesce(m.has_violations, false) as cov_viol
          from parcel p left join municipality m on m.id = p.municipality_id
          where is_residential(p.land_use_code, p.data_limited)
        ),
        cov as (select parcel_key from res where cov_permits),
        viol as (select parcel_key from res where cov_viol),
        cats as (select distinct category from parcel_event where kind in ('permit', 'violation') and category is not null),
        parts as (select unnest(array['roof','gutters','siding','windows','porch','chimney','driveway','garage','paint_peeling','grade']) as part),
        survey_vals as (
          select pt.part, case
              when lower(r.survey_2022->>pt.part) in ('poor','very poor','yes','d','f') then 1.0
              when lower(r.survey_2022->>pt.part) in ('fair','c') then 0.6
              when lower(r.survey_2022->>pt.part) in ('good','very good','no','a','b') then 0.0 end as v
          from res r cross join parts pt where r.survey_2022 is not null
        )
        insert into signal_prior (key, value, n)
        select 'no_recent_permit:' || c.category,
          1 - (select count(*) from parcel_signal s join cov using (parcel_key)
               where s.key = 'last_permit:' || c.category
                 and (s.evidence->>'date')::date >= make_date(extract(year from ${TODAY})::int - 15, 1, 1))::numeric
              / greatest(1, (select count(*) from cov)),
          (select count(*) from cov)
        from cats c where (select count(*) from cov) > 0
        union all
        select 'active_violation:' || c.category,
          (select count(*) from parcel_signal s join viol using (parcel_key) where s.key = 'active_violation:' || c.category)::numeric
            / greatest(1, (select count(*) from viol)),
          (select count(*) from viol)
        from cats c where (select count(*) from viol) > 0
        union all
        select 'neighbor_job:' || c.category,
          (select count(*) from parcel_signal s join cov using (parcel_key) where s.key = 'neighbor_job:' || c.category)::numeric
            / greatest(1, (select count(*) from cov)),
          (select count(*) from cov)
        from cats c where (select count(*) from cov) > 0
        union all
        select 'survey_condition:' || part, avg(v), count(v)::int from survey_vals where v is not null group by part
        union all
        select 'canopy', avg(least(canopy_pct / 60.0, 1)), count(*)::int from res where canopy_pct is not null having count(*) > 0
        union all
        select 'grass', avg(least(grass_pct / 60.0, 1)), count(*)::int from res where grass_pct is not null having count(*) > 0
        union all
        select 'flood', avg(case when in_sfha then 1.0 when flood_zone like '%0.2%' then 0.5 else 0 end), count(*)::int
          from res where in_sfha is not null or flood_zone is not null having count(*) > 0`);
      ctx.meta.priors = pr.count;
    });
  });
}
