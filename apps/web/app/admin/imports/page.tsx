import { getDirectSql } from "@216leads/db";
import { PageHeader, Card } from "@/components/ui";
import { ImportForm } from "./import-form";

export const metadata = { title: "Admin · Imports" };
export const dynamic = "force-dynamic";

// Records-request importer (spec 5.12): permit lists suburbs send in reply to ORC 149.43 requests.
export default async function ImportsPage() {
  const recent = await getDirectSql()<{ source: string; municipality: string; county_code: string; updated_at: string; n: number }[]>`
    select m.source, m.municipality, m.county_code, m.updated_at::text,
      (select count(*) from parcel_event e where e.source = m.source)::int as n
    from import_mapping m order by m.updated_at desc limit 20`;
  return (
    <>
      <PageHeader title="Records-request imports" sub="Upload a city's permit list (CSV, XLSX or PDF), map its columns once, and import. Owner columns can't be mapped." />
      <ImportForm />
      {recent.length ? (
        <>
          <h2 className="mb-2 mt-8 text-lg font-semibold">Cities imported</h2>
          <Card className="divide-y divide-line text-sm">
            {recent.map((r) => (
              <div key={r.source} className="flex justify-between gap-3 px-4 py-3">
                <span className="font-semibold">{r.municipality} <span className="font-normal text-slate">({r.county_code})</span></span>
                <span className="text-slate">{r.n.toLocaleString("en-US")} permits · mapping saved {r.updated_at.slice(0, 10)}</span>
              </div>
            ))}
          </Card>
        </>
      ) : null}
    </>
  );
}
