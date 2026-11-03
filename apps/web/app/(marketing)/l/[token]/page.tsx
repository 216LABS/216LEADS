import { getDirectSql } from "@216leads/db";
import { openProspectList } from "@216leads/ingest";
import { BRAND, countOf, tradeLabel } from "@216leads/shared";
import { getTemplate, hasTemplate } from "@216leads/scoring";
import { Card, LinkButton } from "@/components/ui";
import { ListMap } from "./list-map";

export const dynamic = "force-dynamic";
// Shared lists are for one prospect: keep them out of search engines.
export const metadata = { title: "Your sample list", robots: { index: false, follow: false } };

const DEFAULT_STYLE = "https://tiles.openfreemap.org/styles/liberty";

function trialHref(trade: string, zips: string[], token: string) {
  const next = `/onboarding?trade=${encodeURIComponent(trade)}&zips=${encodeURIComponent(zips.join(","))}&ref=${encodeURIComponent(token)}`;
  return `/signup?next=${encodeURIComponent(next)}`;
}

// Issue #6: the free list a prospect gets after replying to outreach.
export default async function ProspectListPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const list = await openProspectList(getDirectSql(), token, { countView: true });
  if (list.status === "missing") {
    return (
      <section className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-title font-semibold">This list isn&apos;t available</h1>
        <LinkButton href="/signup" className="mt-6">Start your 14-day free trial</LinkButton>
      </section>
    );
  }
  const label = hasTemplate(list.trade) ? getTemplate(list.trade).label : tradeLabel(list.trade);
  const cta = trialHref(list.trade, list.zips, token);
  if (list.status === "expired") {
    return (
      <section className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-title font-semibold">This list expired</h1>
        <p className="mt-2 text-slate">Sample lists last 14 days. Start a free trial to see today&apos;s homes for {list.zips.join(", ")}.</p>
        <LinkButton href={cta} className="mt-6">Start your 14-day free trial</LinkButton>
      </section>
    );
  }
  const points = list.rows.filter((r) => r.lon !== null && r.lat !== null).map((r) => ({ lon: r.lon!, lat: r.lat!, score: r.score }));
  return (
    <section className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-wide text-signal-600">{label} · {list.zips.join(", ")}</p>
      <h1 className="mt-1 text-title font-semibold leading-tight tracking-tight">{countOf(list.rows.length, "home")}{list.business ? ` for ${list.business}` : ""}</h1>
      <p className="mt-2 text-slate">Ranked from this week&apos;s public records, with the reasons behind each one. Link good until {list.expires_at.slice(0, 10)}.</p>
      <div className="mt-6"><ListMap points={points} styleUrl={process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_STYLE} /></div>
      <Card className="mt-6 divide-y divide-line">
        {list.rows.map((r, i) => (
          <div key={`${r.address}-${r.zip}-${i}`} className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="font-semibold">{r.address}, {r.town} {r.zip}</div>
              <ul className="mt-0.5 text-sm text-slate">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
              <div className="mt-0.5 text-xs text-slate">
                {r.year_built ? `Built ${r.year_built}` : ""}{r.year_built && r.last_sale_date ? " · " : ""}{r.last_sale_date ? `Last sold ${r.last_sale_date}` : ""}
              </div>
            </div>
            <span className="num shrink-0 rounded-full bg-signal-50 px-2 text-sm font-semibold text-signal-600">{r.score}</span>
          </div>
        ))}
      </Card>
      <div className="mt-8 rounded-[12px] border border-line bg-white p-6 text-center">
        <h2 className="text-lg font-semibold">Want the whole list, updated every week?</h2>
        <LinkButton href={cta} className="mt-4">Start your 14-day free trial</LinkButton>
      </div>
      <p className="mt-6 text-xs text-slate">{BRAND.disclaimer}</p>
    </section>
  );
}
