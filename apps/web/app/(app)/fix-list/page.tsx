import Link from "next/link";
import { getSql } from "@216leads/db";
import { fixList } from "@216leads/ingest";
import { CATEGORY_NOUN } from "@216leads/scoring";
import { titleCase, tradeInText, violationItems } from "@216leads/shared";
import { requireOrg } from "@/lib/session";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Needs a fix" };
export const dynamic = "force-dynamic";

// Violations fix list: open city code citations in the area that call for the org's kind of work.
export default async function FixListPage() {
  const { org } = await requireOrg();
  const { category, rows } = await fixList(getSql(), org.id, org.trade);
  const noun = category ? CATEGORY_NOUN[category] ?? category : null;
  return (
    <>
      <PageHeader
        title="Needs a fix"
        sub={noun ? `Open city code violations in your area that need ${noun} work. The owner has been told to fix these.` : undefined}
      />
      {!category ? (
        <EmptyState title={`Nothing to fix for ${tradeInText(org.trade)}`}>
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
                <Findings items={violationItems(r.description)} fallback={r.raw_type ?? "Code violation"} />
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

/** The city's citation text is a long form in capitals; show the first two findings and fold the rest. */
function Findings({ items, fallback }: { items: string[]; fallback: string }) {
  if (!items.length) return <div className="text-slate">{fallback}</div>;
  const [first, rest] = [items.slice(0, 2), items.slice(2)];
  return (
    <div className="text-slate">
      <ul className="list-disc space-y-0.5 pl-5">{first.map((t) => <li key={t} className="line-clamp-2">{t}</li>)}</ul>
      {rest.length ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-navy underline underline-offset-2">{rest.length} more</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{rest.map((t) => <li key={t}>{t}</li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}
