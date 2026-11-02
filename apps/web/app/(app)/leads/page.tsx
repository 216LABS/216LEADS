import Link from "next/link";
import { tradeLabel } from "@216leads/shared";
import { requireOrg } from "@/lib/session";
import { leadCounts, leadQueryFromParams, listLeads, PAGE_SIZE } from "@/lib/leads";
import { FilterBar } from "@/components/filter-bar";
import { LeadList } from "@/components/lead-list";
import { CoachMarks } from "@/components/coach-marks";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Leads" };

type SP = Record<string, string | string[] | undefined>;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const raw = await searchParams;
  const sp = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0]! : v]])));
  const { org } = await requireOrg();
  const query = leadQueryFromParams(sp);
  const [{ rows, total, page }, counts] = await Promise.all([listLeads(org.id, query), leadCounts(org.id)]);
  const filtered = !!(query.q || query.chips?.length || query.zip || query.view !== "active");
  const pageHref = (n: number) => {
    const p = new URLSearchParams(sp);
    p.set("page", String(n));
    return `/leads?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Leads"
        sub={`${counts.active.toLocaleString()} ${tradeLabel(org.trade).toLowerCase()} homes in your area · ${counts.new_week.toLocaleString()} new this week`}
      />
      <FilterBar counts={{ active: counts.active, won: counts.won, lost: counts.lost, skipped: counts.skipped }} />
      {rows.length === 0 ? (
        filtered ? (
          <EmptyState title="No homes match these filters" action={<Link href="/leads" className="font-semibold text-navy underline">Clear filters</Link>}>
            Try fewer filters, or another status tab.
          </EmptyState>
        ) : (
          <EmptyState title="No homes match yet">
            Cuyahoga sales update daily and Cleveland permits update every morning; Lake permits post monthly. Widen your area or loosen your
            perfect-customer settings in Settings to see more homes.
          </EmptyState>
        )
      ) : (
        <>
          {!org.coach_marks_seen ? <CoachMarks /> : null}
          <LeadList leads={rows} />
        </>
      )}
      {total > PAGE_SIZE ? (
        <nav className="mt-4 flex items-center justify-center gap-4 text-sm text-slate" aria-label="Pages">
          {page > 1 ? <Link className="focus-ring font-semibold text-navy underline" href={pageHref(page - 1)}>Previous</Link> : null}
          <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(total, page * PAGE_SIZE)} of {total.toLocaleString()}</span>
          {page * PAGE_SIZE < total ? <Link className="focus-ring font-semibold text-navy underline" href={pageHref(page + 1)}>Next</Link> : null}
        </nav>
      ) : null}
    </>
  );
}
