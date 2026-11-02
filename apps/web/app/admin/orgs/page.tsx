import { getSql } from "@216leads/db";
import { tradeLabel } from "@216leads/shared";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Admin · Orgs" };
export const dynamic = "force-dynamic";

export default async function OrgsPage() {
  const sql = getSql();
  const orgs = await sql<{ id: string; name: string; trade: string; plan: string; created_at: string; zips: string[]; leads: number; won: number; members: number; mailed: number }[]>`
    select o.id, o.name, o.trade, o.plan, o.created_at,
      coalesce(array_agg(distinct t.zip) filter (where t.zip is not null), '{}') as zips,
      (select count(*) from lead l where l.org_id = o.id)::int as leads,
      (select count(*) from lead l where l.org_id = o.id and l.status = 'won')::int as won,
      (select count(*) from org_member m where m.org_id = o.id)::int as members,
      (select count(*) from mail_piece mp where mp.org_id = o.id)::int as mailed
    from org o left join territory t on t.org_id = o.id
    group by o.id order by o.created_at desc`;
  return (
    <>
      <PageHeader title="Orgs" sub="Read-only overview of customer accounts." />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate">
            <tr className="border-b border-line">
              <th className="px-4 py-2">Org</th><th className="px-4 py-2">Plan</th><th className="px-4 py-2">Zips</th>
              <th className="px-4 py-2 text-right">Leads</th><th className="px-4 py-2 text-right">Won</th><th className="px-4 py-2 text-right">Mailed</th><th className="px-4 py-2 text-right">Users</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2"><div className="font-semibold">{o.name}</div><div className="text-xs text-slate">{tradeLabel(o.trade)} · since {o.created_at.slice(0, 10)}</div></td>
                <td className="px-4 py-2"><Badge tone={o.plan === "canceled" ? "lost" : o.plan === "trial" ? "slate" : "won"}>{o.plan}</Badge></td>
                <td className="num px-4 py-2 text-xs">{o.zips.join(", ")}</td>
                <td className="num px-4 py-2 text-right">{o.leads.toLocaleString()}</td>
                <td className="num px-4 py-2 text-right">{o.won}</td>
                <td className="num px-4 py-2 text-right">{o.mailed}</td>
                <td className="num px-4 py-2 text-right">{o.members}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
