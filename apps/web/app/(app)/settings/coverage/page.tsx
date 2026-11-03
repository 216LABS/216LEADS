import Link from "next/link";
import { getSql } from "@216leads/db";
import { titleCase } from "@216leads/shared";
import { Card } from "@/components/ui";
import { SettingsHeader } from "@/components/settings-bits";
import { requireOrg } from "@/lib/session";

export const metadata = { title: "Data coverage" };

const TIER: Record<string, string> = {
  open_api: "Permits daily from the city",
  monthly_list: "Permits from the monthly list",
  records_request: "Permits from a records request, updated a few times a year",
  county_only: "County records only, no city permits",
};

// Issue #70: which public records we hold for each town in the org's area, and how fresh.
// ZIP and town territories only; drawn areas would need a spatial join on every load.
export default async function DataCoveragePage() {
  const { org } = await requireOrg();
  const towns = await getSql()<{ town: string; county: string; tier: string; since: number | null; updated: string | null; homes: number }[]>`
    with homes as (
      select p.parcel_key, p.municipality_id from territory t join parcel p on p.zip = t.zip
      where t.org_id = ${org.id} and t.kind = 'zip'
      union
      select p.parcel_key, p.municipality_id from territory t join parcel p on p.municipality_id = t.municipality_id
      where t.org_id = ${org.id} and t.kind = 'municipality'
    )
    select m.name as town, c.name as county, m.data_tier as tier, m.permits_since as since,
           s.last_success_at::text as updated, count(*)::int as homes
    from homes h
    join municipality m on m.id = h.municipality_id
    join county c on c.code = m.county_code
    left join source s on s.code = m.permits_source
    group by m.id, m.name, c.name, m.data_tier, m.permits_since, s.last_success_at
    order by homes desc`;
  return (
    <>
      <SettingsHeader title="Data coverage" />
      <p className="mb-4 text-sm text-slate">
        County parcel and sale records cover every town. City permit data varies by town:
      </p>
      {towns.length ? (
        <Card className="divide-y divide-line">
          {towns.map((t) => (
            <div key={`${t.county}-${t.town}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4">
              <div>
                <p className="font-semibold">{titleCase(t.town)} <span className="font-normal text-slate">· {t.county} County</span></p>
                <p className="text-sm text-slate">{TIER[t.tier] ?? TIER.county_only}{t.since ? `, since ${t.since}` : ""}</p>
              </div>
              <p className="num text-sm text-slate">
                {t.homes.toLocaleString("en-US")} homes{t.updated ? ` · permits updated ${t.updated.slice(0, 10)}` : ""}
              </p>
            </div>
          ))}
        </Card>
      ) : (
        <Card className="p-4 text-sm text-slate">No towns yet. <Link href="/settings/territories" className="font-semibold text-navy underline">Add your area</Link> to see its coverage.</Card>
      )}
      <p className="mt-4 text-sm text-slate">
        Every source and its schedule is on the <Link href="/data" className="underline">data page</Link>. Coverage for all areas is on the <Link href="/coverage" className="underline">coverage page</Link>.
      </p>
    </>
  );
}
