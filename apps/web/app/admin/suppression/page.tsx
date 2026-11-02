import { getSql } from "@216leads/db";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Admin · Suppression" };
export const dynamic = "force-dynamic";

// Issue #2: global suppression count and the latest 50 entries (addresses only; nothing else is collected).
export default async function SuppressionPage() {
  const sql = getSql();
  const [c] = await sql<{ n: number; returned: number }[]>`
    select count(*)::int as n, count(*) filter (where reason = 'returned_mail')::int as returned from suppression`;
  const rows = await sql<{ addr_norm: string; reason: string; created_at: string }[]>`
    select addr_norm, reason, created_at::text from suppression order by created_at desc limit 50`;
  return (
    <>
      <PageHeader title="Suppression" sub={`${c?.n ?? 0} addresses (${c?.returned ?? 0} from returned mail)`} />
      <Card className="divide-y divide-line">
        {rows.map((r) => (
          <div key={r.addr_norm} className="flex justify-between gap-3 px-4 py-2 text-sm">
            <span className="num">{r.addr_norm.replace("|", ", ")}</span>
            <span className="text-slate">{r.reason} · {r.created_at.slice(0, 10)}</span>
          </div>
        ))}
      </Card>
    </>
  );
}
