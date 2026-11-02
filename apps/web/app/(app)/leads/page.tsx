import Link from "next/link";
import { titleCase, tradeLabel } from "@216leads/shared";
import { requireOrg } from "@/lib/session";
import { leadCounts, listLeads, PAGE_SIZE, type LeadChip, type LeadSort, type LeadView } from "@/lib/leads";
import { ReasonList, ScoreChip, StatusPill, TriggerPill } from "@/components/lead-bits";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Leads" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { org } = await requireOrg();
  const chips = (one(sp.chips) ?? "").split(",").filter(Boolean) as LeadChip[];
  const query = {
    view: (one(sp.view) as LeadView) ?? "active",
    chips,
    q: one(sp.q),
    zip: one(sp.zip),
    sort: (one(sp.sort) as LeadSort) ?? "score",
    page: Number(one(sp.page) ?? 1),
  };
  const [{ rows, total, page }, counts] = await Promise.all([listLeads(org.id, query), leadCounts(org.id)]);

  return (
    <>
      <PageHeader
        title="Leads"
        sub={`${counts.active.toLocaleString()} ${tradeLabel(org.trade).toLowerCase()} homes in your area · ${counts.new_week.toLocaleString()} new this week`}
      />
      {rows.length === 0 ? (
        <EmptyState title="No homes match yet">
          Cuyahoga sales update daily and Cleveland permits update every morning; Lake permits post monthly. Widen your area or loosen your
          perfect-customer settings to see more homes.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((l) => (
            <li key={l.id}>
              <Link href={`/leads/${l.id}`} className="card focus-ring flex gap-3 p-4 hover:border-navy/30">
                <ScoreChip score={l.score} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num truncate text-base font-semibold">{titleCase(l.addr_line)}</span>
                    <span className="text-sm text-slate">{titleCase(l.city)} {l.zip}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <TriggerPill label={l.trigger_label} date={l.trigger_date} />
                    <StatusPill status={l.status} />
                  </div>
                  <div className="mt-2 text-slate">
                    <ReasonList reasons={l.reasons} limit={2} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {total > PAGE_SIZE ? (
        <p className="mt-4 text-center text-sm text-slate">
          Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(total, page * PAGE_SIZE)} of {total.toLocaleString()}
        </p>
      ) : null}
    </>
  );
}
