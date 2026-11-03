import clsx from "clsx";
import Link from "next/link";
import { getDirectSql } from "@216leads/db";
import { competitors } from "@216leads/ingest";
import { CATEGORY_NOUN, TRADE_CATEGORY } from "@216leads/scoring";
import { planLimits, titleCase, tradeLabel } from "@216leads/shared";
import { requireOrg } from "@/lib/session";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { MarketNav, MarketUpsell } from "../market-nav";

export const metadata = { title: "Competitors" };
export const dynamic = "force-dynamic";

const WINDOWS = [30, 90, 365] as const;

// Competitor tracker (spec 8, 9.3): businesses pulling permits in the org's area, from public permits.
export default async function CompetitorsPage({ searchParams }: { searchParams: Promise<{ days?: string; all?: string }> }) {
  const { org } = await requireOrg();
  if (!planLimits(org.plan).marketTools) {
    return (
      <>
        <PageHeader title="Competitors" />
        <MarketUpsell />
      </>
    );
  }
  const sp = await searchParams;
  const days = WINDOWS.find((d) => String(d) === sp.days) ?? 90;
  const tradeCat = TRADE_CATEGORY[org.trade] ?? null;
  const all = sp.all === "1" || !tradeCat;
  const r = await competitors(getDirectSql(), org.id, { days, category: all ? null : tradeCat });
  const noun = (c: string) => CATEGORY_NOUN[c] ?? c.replace("_", " ");
  const href = (o: { days?: number; all?: boolean }) => {
    const q = new URLSearchParams();
    if ((o.days ?? days) !== 90) q.set("days", String(o.days ?? days));
    if (o.all ?? all) q.set("all", "1");
    const s = q.toString();
    return `/map/competitors${s ? `?${s}` : ""}`;
  };
  const chip = (active: boolean) =>
    clsx("focus-ring tap inline-flex items-center rounded-full border px-3 text-sm font-semibold", active ? "border-navy bg-navy text-white" : "border-line bg-white text-slate hover:text-navy");

  return (
    <>
      <PageHeader
        title="Competitors"
        sub={`${r.total_permits.toLocaleString()} ${all ? "" : `${noun(tradeCat!)} `}permits in your area in the last ${days === 365 ? "12 months" : `${days} days`}, from public city records.`}
      />
      <MarketNav active="competitors" />
      <div className="mb-4 flex flex-wrap gap-2">
        {tradeCat ? (
          <>
            <Link href={href({ all: false })} className={chip(!all)}>{tradeLabel(org.trade)} permits</Link>
            <Link href={href({ all: true })} className={chip(all)}>All permits</Link>
            <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
          </>
        ) : null}
        {WINDOWS.map((d) => (
          <Link key={d} href={href({ days: d })} className={chip(d === days)}>{d === 365 ? "12 months" : `${d} days`}</Link>
        ))}
      </div>

      {r.competitors.length ? (
        <ol className="space-y-3">
          {r.competitors.map((c, i) => (
            <li key={c.contractor_id}>
              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <span className="num w-6 shrink-0 pt-0.5 text-right text-sm font-semibold text-slate">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <h2 className="font-semibold">{titleCase(c.name)}</h2>
                      <span className="num text-sm text-slate"><b className="text-navy">{c.count}</b> permit{c.count === 1 ? "" : "s"} · last {c.last_date}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {c.categories.map((k) => (
                        <span key={k.category} className="rounded-full bg-navy-50 px-2 py-0.5 text-xs font-semibold text-navy">{noun(k.category)} {k.count}</span>
                      ))}
                    </div>
                    <ul className="mt-2 space-y-0.5 text-sm text-slate">
                      {c.recent.map((a, j) => (
                        <li key={j} className="flex justify-between gap-3">
                          <span className="truncate font-mono">{titleCase(a.address)}, {titleCase(a.city)}</span>
                          <span className="num shrink-0">{a.date}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState title="No business permits here yet">
          Cleveland permits update daily; Lake County permits monthly. Towns that don&apos;t publish permits won&apos;t show up here.
        </EmptyState>
      )}
      {r.independent_permits ? (
        <p className="mt-4 text-sm text-slate">
          Plus {r.independent_permits} permit{r.independent_permits === 1 ? "" : "s"} pulled by independent contractors or homeowners, which we don&apos;t name.
        </p>
      ) : null}
    </>
  );
}
