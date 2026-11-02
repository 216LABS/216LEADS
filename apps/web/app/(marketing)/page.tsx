import Link from "next/link";
import { redirect } from "next/navigation";
import { getSql } from "@216leads/db";
import { liveCounter } from "@216leads/ingest";
import { BRAND, TRADES } from "@216leads/shared";
import { getUser } from "@/lib/session";
import { Card, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

const STEPS = [
  { title: "Tell us your trade and area", body: "Pick your ZIP codes or towns. Answer a few questions about the jobs you want." },
  { title: "Get your homes, ranked", body: "Every home scored for your work, with the public records behind it: age, recent sales, permits that are due, code violations." },
  { title: "Act on them", body: "Track them in a simple pipeline, mail a postcard to one or a whole block, and see what you won." },
];

const FAQ = [
  ["Where does the data come from?", "Free public records: county parcels and sales, city permits and code violations, the rental registry, FEMA flood zones and county tree canopy. See the coverage page for every source and how fresh it is."],
  ["Do you sell homeowner names or phone numbers?", "No. We never store homeowner names, and there's no calling, texting or contact lists. Postcards go to \"Current Resident\", and any homeowner can opt out."],
  ["Which areas do you cover?", "Cuyahoga, Lake, Stark and Medina counties, with Summit permits where available. Cleveland has the richest data (daily permits and violations)."],
  ["How much does it cost?", "Plans start at $99 a month after a 14-day free trial, no card needed to start. Postcards are $0.99 each beyond your plan's monthly credits."],
  ["Can I cancel?", "Any time, from Settings. If you don't book a job from 216 HomeSignal in your first 60 days, we refund month 2."],
] as const;

export default async function Landing() {
  if (await getUser()) redirect("/leads");
  const counter = await liveCounter(getSql()).catch(() => ({ sales: 0 }));
  return (
    <>
      <section className="mx-auto max-w-5xl px-4 pb-12 pt-14 text-center md:pt-20">
        <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">{BRAND.tagline}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate">
          Northeast Ohio homes ranked for your trade, with the public-record reasons behind each one. Then mail them, track them, and see what you won.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <LinkButton href="/signup">Start free trial</LinkButton>
          <LinkButton href="/sample" variant="secondary">See a sample for your ZIP</LinkButton>
        </div>
        {counter.sales > 0 ? (
          <p className="mt-8 text-sm text-slate">
            <span className="num text-2xl font-bold text-signal-600">{counter.sales.toLocaleString("en-US")}</span>{" "}
            single-family homes sold in Cuyahoga County in the last 30 days. Every one is a lead for someone.
          </p>
        ) : null}
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-12 md:grid-cols-3" aria-label="How it works">
        {STEPS.map((s, i) => (
          <Card key={s.title} className="p-5">
            <div className="num text-sm font-bold text-signal-600">{i + 1}</div>
            <h2 className="mt-1 font-bold">{s.title}</h2>
            <p className="mt-1 text-sm text-slate">{s.body}</p>
          </Card>
        ))}
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-12">
        <h2 className="mb-3 text-xl font-bold">Built for home-service trades</h2>
        <ul className="flex flex-wrap gap-2">
          {TRADES.map((t) => (
            <li key={t.key}><Link href={`/sample?trade=${t.key}`} className="focus-ring tap inline-flex items-center rounded-full border border-line bg-white px-3 text-sm font-semibold hover:border-navy/30">{t.label}</Link></li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-16">
        <h2 className="mb-3 text-xl font-bold">Questions</h2>
        <div className="divide-y divide-line rounded-[12px] border border-line bg-white">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-5 py-4">
              <summary className="focus-ring cursor-pointer list-none font-semibold">{q}</summary>
              <p className="mt-2 text-sm text-slate">{a}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-sm"><Link href="/pricing" className="font-semibold text-navy underline">See pricing</Link> · <Link href="/coverage" className="font-semibold text-navy underline">See coverage</Link></p>
      </section>
    </>
  );
}
