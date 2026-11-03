import Link from "next/link";
import { titleCase, tradeWord } from "@216leads/shared";
import { requireOrg } from "@/lib/session";
import { leadCounts, leadQueryFromParams, listLeads, PAGE_SIZE } from "@/lib/leads";
import { FilterBar } from "@/components/filter-bar";
import { LeadList, type ListLead } from "@/components/lead-list";
import { CoachMarks } from "@/components/coach-marks";
import { ScoreChip } from "@/components/lead-bits";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "Leads" };

type SP = Record<string, string | string[] | undefined>;

/** "Start here" (issue #59): the 5 best new homes and one button that mails them. */
function TopFive({ leads }: { leads: ListLead[] }) {
  return (
    <section aria-labelledby="top5" className="mb-6">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h2 id="top5" className="text-base font-semibold">Your top {leads.length} this week</h2>
      </div>
      <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0">
        {leads.map((l) => (
          <li key={l.id} className="w-64 shrink-0 snap-start md:w-auto">
            <Link href={`/leads/${l.id}`} className="focus-ring card flex h-full gap-2 p-2 hover:border-navy/30">
              <ScoreChip score={l.score} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{titleCase(l.addr_line)}</span>
                <span className="line-clamp-2 text-xs text-slate">{l.reasons[0]?.label ?? `${titleCase(l.city)} ${l.zip}`}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <LinkButton href={`/mail/send?leads=${leads.map((l) => l.id).join(",")}`} className="mt-2 min-h-12 w-full md:w-auto">
        Mail these {leads.length}
      </LinkButton>
    </section>
  );
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const raw = await searchParams;
  const sp = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0]! : v]])));
  const { org } = await requireOrg();
  const query = leadQueryFromParams(sp);
  const [{ rows, total, page }, counts] = await Promise.all([listLeads(org.id, query), leadCounts(org.id)]);
  const filtered = !!(query.q || query.chips?.length || query.zip || query.view !== "active");
  const top = !filtered && page === 1 ? rows.filter((l) => l.status === "new").slice(0, 5) : [];
  const pageHref = (n: number) => {
    const p = new URLSearchParams(sp);
    p.set("page", String(n));
    return `/leads?${p.toString()}`;
  };
  const trade = tradeWord(org.trade);

  return (
    <>
      <PageHeader
        title="Leads"
        sub={counts.new_week
          ? `${counts.new_week.toLocaleString("en-US")} new ${trade} ${counts.new_week === 1 ? "home" : "homes"} this week in your area`
          : `${counts.active.toLocaleString("en-US")} ${trade} ${counts.active === 1 ? "home" : "homes"} in your area`}
      />
      {top.length >= 3 ? <TopFive leads={top} /> : null}
      <FilterBar
        counts={{ active: counts.active, won: counts.won, lost: counts.lost, skipped: counts.skipped }}
        extra={<Link href="/fix-list" className="focus-ring shrink-0 text-sm text-slate underline underline-offset-2 hover:text-navy">Needs a fix</Link>}
      />
      {rows.length === 0 ? (
        filtered ? (
          <EmptyState title="No homes match these filters" action={<LinkButton href="/leads" variant="secondary">Clear filters</LinkButton>}>
            Try fewer filters, or another status tab.
          </EmptyState>
        ) : (
          <EmptyState title="No homes match yet" action={
            <div className="flex flex-col items-center gap-2">
              <LinkButton href="/settings/territories">Widen my area</LinkButton>
              <Link href="/settings/profile" className="focus-ring text-sm text-slate underline underline-offset-2">Change the homes you want</Link>
            </div>
          }>
            Add a few more ZIP codes or towns to see more homes.
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
          {page > 1 ? <Link className="focus-ring text-navy underline" href={pageHref(page - 1)}>Previous</Link> : null}
          <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(total, page * PAGE_SIZE)} of {total.toLocaleString()}</span>
          {page * PAGE_SIZE < total ? <Link className="focus-ring text-navy underline" href={pageHref(page + 1)}>Next</Link> : null}
        </nav>
      ) : null}
    </>
  );
}
