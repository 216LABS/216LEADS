import Link from "next/link";
import { getSql } from "@216leads/db";
import { hasTemplate } from "@216leads/scoring";
import { TRADES, TRIAL } from "@216leads/shared";
import { Card, LinkButton } from "@/components/ui";

export const metadata = { title: "Coverage" };
export const dynamic = "force-dynamic";

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

// Public coverage page (spec 9.8, issue #70): the counties and towns we score, and the trades we score for.
export default async function CoveragePage() {
  const counties = await getSql()<{ code: string; name: string; towns: string[] }[]>`
    select c.code, c.name, coalesce(array_agg(m.name order by m.name) filter (where m.name is not null), '{}') as towns
    from county c left join municipality m on m.county_code = c.code
    group by c.code, c.name order by c.name`;
  const trades = TRADES.filter((t) => hasTemplate(t.key));
  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-title font-semibold leading-tight tracking-tight">Coverage</h1>
      <p className="mt-2 max-w-2xl text-slate">
        216 HomeSignal scores homes in {counties.length} Northeast Ohio counties from public records.
        Choose the ZIPs you work in when you sign up.
      </p>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Areas</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {counties.map((c) => (
          <Card key={c.code} className="p-5">
            <h3 className="font-semibold">{c.name} County</h3>
            <p className="mt-1 text-sm text-slate">{c.towns.length ? c.towns.map(titleCase).join(", ") : "County-wide records"}</p>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Trades</h2>
      <ul className="flex flex-wrap gap-2">
        {trades.map((t) => (
          <li key={t.key}><Link href={`/sample?trade=${t.key}`} className="focus-ring tap inline-flex items-center rounded-[4px] border border-line bg-white px-4 text-sm hover:border-navy/30">{t.label}</Link></li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-slate">Tap a trade to see real counts for your ZIP.</p>

      <div className="mt-10">
        <LinkButton href="/signup" className="min-h-12 px-6 text-base">Start free trial</LinkButton>
        <p className="mt-2 text-sm text-slate">{TRIAL.days} days free, no card needed. <Link href="/data" className="underline">Where the data comes from</Link></p>
      </div>
    </section>
  );
}
