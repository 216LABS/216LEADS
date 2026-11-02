import Link from "next/link";
import { getSql } from "@216leads/db";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Admin · Unmatched" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

export default async function UnmatchedPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const source = typeof sp.source === "string" ? sp.source : null;
  const page = Math.max(1, Number(sp.page ?? 1));
  const sql = getSql();
  const [bySource, rows] = await Promise.all([
    sql<{ source: string; n: number; old: number }[]>`
      select source, count(*)::int as n, count(*) filter (where created_at < now() - interval '14 days')::int as old
      from unmatched_record group by source order by n desc`,
    sql<{ id: number; source: string; source_record_id: string; addr_raw: string | null; zip_raw: string | null; parcel_raw: string | null;
      attempts: number; last_error: string | null; created_at: string; event_date: string | null; raw_type: string | null }[]>`
      select u.id, u.source, u.source_record_id, u.addr_raw, u.zip_raw, u.parcel_raw, u.attempts, u.last_error, u.created_at,
        e.event_date, e.raw_type
      from unmatched_record u left join parcel_event e on e.source = u.source and e.source_record_id = u.source_record_id
      where (${source}::text is null or u.source = ${source})
      order by u.created_at < now() - interval '14 days' desc, u.id desc
      limit 100 offset ${(page - 1) * 100}`,
  ]);
  return (
    <>
      <PageHeader title="Unmatched records" sub="Records we could not tie to a home. They retry daily for 14 days; older ones need a look." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/unmatched" className="focus-ring"><Badge tone={source ? "slate" : "navy"}>All</Badge></Link>
        {bySource.map((s) => (
          <Link key={s.source} href={`/admin/unmatched?source=${s.source}`} className="focus-ring">
            <Badge tone={source === s.source ? "navy" : "slate"}>{s.source}: {s.n.toLocaleString()}{s.old ? ` (${s.old.toLocaleString()} > 14d)` : ""}</Badge>
          </Link>
        ))}
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate">
            <tr className="border-b border-line">
              <th className="px-4 py-2">Source / record</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Address</th>
              <th className="px-4 py-2">Parcel</th><th className="px-4 py-2">Type</th><th className="px-4 py-2 text-right">Attempts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2"><div className="font-semibold">{r.source}</div><div className="num text-xs text-slate">{r.source_record_id}</div></td>
                <td className="num px-4 py-2 text-xs">{r.event_date ?? "–"}</td>
                <td className="num px-4 py-2">{r.addr_raw ?? "–"} {r.zip_raw}</td>
                <td className="num px-4 py-2">{r.parcel_raw ?? "–"}</td>
                <td className="px-4 py-2 text-xs text-slate">{r.raw_type ?? ""}</td>
                <td className="num px-4 py-2 text-right">{r.attempts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="mt-4 flex justify-between text-sm">
        {page > 1 ? <Link className="underline" href={`/admin/unmatched?${source ? `source=${source}&` : ""}page=${page - 1}`}>Previous</Link> : <span />}
        {rows.length === 100 ? <Link className="underline" href={`/admin/unmatched?${source ? `source=${source}&` : ""}page=${page + 1}`}>Next</Link> : null}
      </div>
    </>
  );
}
