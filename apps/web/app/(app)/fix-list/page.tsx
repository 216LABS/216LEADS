import Link from "next/link";
import { getDirectSql } from "@216leads/db";
import { fixList } from "@216leads/ingest";
import { CATEGORY_NOUN } from "@216leads/scoring";
import { titleCase, tradeLabel } from "@216leads/shared";
import { requireOrg } from "@/lib/session";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Needs a fix" };
export const dynamic = "force-dynamic";

// Violations fix list: open city code citations in the area that call for the org's kind of work.
export default async function FixListPage() {
  const { org } = await requireOrg();
  const { category, rows } = await fixList(getDirectSql(), org.id, org.trade);
  const noun = category ? CATEGORY_NOUN[category] ?? category : null;
  return (
    <>
      <PageHeader
        title="Needs a fix"
        sub={noun ? `Open city code violations in your area that need ${noun} work. The owner has been told to fix these.` : undefined}
      />
      {!category ? (
        <EmptyState title={`Nothing to fix for ${tradeLabel(org.trade).toLowerCase()}`}>
          City code violations are written for building trades (roofing, siding, gutters, HVAC and so on), so there's nothing to match here.
        </EmptyState>
      ) : !rows.length ? (
        <EmptyState title="No open violations right now">
          Nothing open in your area needs {noun} work. Cleveland publishes violations daily; most suburbs don't publish them at all.
        </EmptyState>
      ) : (
        <Card className="divide-y divide-line">
          {rows.map((r) => (
            <div key={r.event_id} className="flex flex-wrap items-baseline justify-between gap-2 p-4 text-sm">
              <div className="min-w-0">
                <div className="font-semibold text-navy">
                  {r.lead_id ? <Link href={`/leads/${r.lead_id}`} className="focus-ring hover:underline">{titleCase(r.addr_line)}</Link> : titleCase(r.addr_line)}
                  <span className="font-normal text-slate">, {titleCase(r.city)} {r.zip}</span>
                </div>
                <div className="text-slate">{r.description ?? r.raw_type ?? "Code violation"}</div>
              </div>
              <div className="text-right text-xs text-slate">
                Cited {r.event_date}
                {r.source_url ? <> · <a className="underline" href={r.source_url} target="_blank" rel="noreferrer">record</a></> : null}
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
