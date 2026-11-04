import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql } from "@216leads/db";
import { publicSample } from "@216leads/ingest";
import { hasTemplate } from "@216leads/scoring";
import { tradeLabel, tradeWord, withArticle } from "@216leads/shared";
import { Card, LinkButton, MetricTile } from "@/components/ui";
import { SampleRequest } from "./sample-request";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ trade: string; zip: string }> }) {
  const { trade, zip } = await params;
  return { title: `${tradeLabel(trade)} leads in ${zip}` };
}

// Sample page (spec 9.8): real counts for a trade + ZIP, with masked house numbers ("12xx W 117th St").
export default async function SamplePage({ params }: { params: Promise<{ trade: string; zip: string }> }) {
  const { trade, zip } = await params;
  if (!hasTemplate(trade) || !/^\d{5}$/.test(zip)) notFound();
  const s = await publicSample(getSql(), trade, zip);
  return (
    <section className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-sm"><Link href={`/sample?trade=${trade}`} className="text-slate underline">Try another ZIP</Link></p>
      {!s ? (
        <>
          <h1 className="mt-2 text-title font-semibold leading-tight tracking-tight">We don&apos;t cover {zip} yet</h1>
          <p className="mt-2 text-slate">We cover Cuyahoga, Lake, Stark and Medina counties. <Link href="/coverage" className="underline">See coverage</Link>.</p>
        </>
      ) : (
        <>
          <h1 className="mt-2 text-title font-semibold leading-tight tracking-tight">{s.matching.toLocaleString("en-US")} homes in {s.zip} {s.town} need {withArticle(tradeWord(trade))} business</h1>
          <p className="mt-2 text-slate">Out of {s.homes.toLocaleString("en-US")} homes, scored from public records this week.</p>
          <div className="mt-6 grid grid-cols-3 gap-3">
            <MetricTile label="Homes" value={s.homes.toLocaleString("en-US")} />
            <MetricTile label="Good leads" value={s.matching.toLocaleString("en-US")} tone="signal" />
            <MetricTile label="New this week" value={s.newThisWeek.toLocaleString("en-US")} tone="won" />
          </div>
          <h2 className="mb-2 mt-8 text-lg font-semibold">A few of them</h2>
          <Card className="divide-y divide-line">
            {s.examples.map((e) => (
              <div key={`${e.addr}-${e.score}`} className="p-4">
                <div className="flex justify-between gap-3">
                  <span className="font-semibold">{e.addr}, {e.city}</span>
                  <span className="num text-sm font-semibold text-navy">{e.score}</span>
                </div>
                {e.trigger ? <div className="mt-1 text-sm font-semibold text-won">{e.trigger}</div> : null}
                <ul className="mt-1 text-sm text-slate">{e.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            ))}
          </Card>
          <div className="mt-6 flex flex-wrap gap-3"><LinkButton href="/signup">See all {s.matching.toLocaleString("en-US")} free for 14 days</LinkButton></div>
          <SampleRequest trade={trade} zip={zip} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} />
        </>
      )}
    </section>
  );
}
