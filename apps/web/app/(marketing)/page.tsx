import Link from "next/link";
import { redirect } from "next/navigation";
import { getSql } from "@216leads/db";
import { liveCounter } from "@216leads/ingest";
import { TRADES } from "@216leads/shared";
import { getUser } from "@/lib/session";
import { LinkButton } from "@/components/ui";
import { ScoreChip, TriggerPill } from "@/components/lead-bits";
import { PostcardPreview } from "@/components/postcard-preview";

export const dynamic = "force-dynamic";

// Seeded, NE Ohio-style example rows for the product shots. House numbers are masked ("24xx"), so
// no row points at a real home and no names appear anywhere (issue #59: real UI, fake addresses).
const EXAMPLE = [
  { score: 94, address: "24xx Elmwood Ave", town: "Lakewood 44107", reason: "Roof likely past its 22-yr life", trigger: { label: "Just sold", days: 6 } },
  { score: 91, address: "17xx Westwood Dr", town: "Parma 44134", reason: "No roof permit on record since 2015", trigger: { label: "Neighbors re-roofing", days: 12 } },
  { score: 88, address: "31xx Belvoir Blvd", town: "Shaker Heights 44122", reason: "Sold in Shaker Heights, which requires a point-of-sale inspection", trigger: null },
  { score: 84, address: "12xx Ridgewood Rd", town: "Euclid 44117", reason: "Built 1924 (102 yrs old)", trigger: null },
];
const REASONS = ["Roof likely past its 22-yr life", "Built 1924 (102 yrs old)", "Sold 6 days ago for $214,000", "No roof permit on record since 2015", "48% tree canopy over the lot"];

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** A static render of the real lead list, framed like a phone or desktop window. */
function ProductShot() {
  return (
    <div className="rounded-[10px] border border-line bg-paper p-4 shadow-sm" aria-label="216 HomeSignal lead list with example homes">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-semibold">Your top homes this week</span>
        <span className="text-xs text-slate">Roofing · 3 ZIP codes</span>
      </div>
      <ul className="space-y-2">
        {EXAMPLE.map((r) => (
          <li key={r.address} className="flex gap-4 rounded-[10px] bg-white p-2">
            <ScoreChip score={r.score} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{r.address}</div>
              <div className="text-xs text-slate">{r.town}</div>
              <div className="mt-1 text-xs text-slate">{r.reason}</div>
              {r.trigger ? <div className="mt-1"><TriggerPill label={r.trigger.label} date={daysAgo(r.trigger.days)} /></div> : null}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex min-h-11 items-center justify-center rounded-[10px] bg-navy text-sm font-semibold text-white" aria-hidden>Mail these 4</div>
    </div>
  );
}

const FAQ = [
  ["Where does the data come from?", "Free public records: county parcels and sales, city permits and code violations, the rental registry, FEMA flood zones and county tree canopy. The coverage page lists every source and how fresh it is."],
  ["Do you sell homeowner names or phone numbers?", "No. We never store homeowner names, and there's no calling, texting or contact lists. Postcards go to \"Current Resident\", and any homeowner can opt out."],
  ["Which areas do you cover?", "Cuyahoga, Lake, Stark and Medina counties, with Summit permits where available. Cleveland has the richest data (daily permits and violations)."],
  ["How much does it cost?", "Plans start at $99 a month after a 14-day free trial, no card needed to start. Postcards are $0.99 each beyond your plan's monthly credits."],
  ["Can I cancel?", "Any time, from Settings. If you don't book a job from 216 HomeSignal in your first 60 days, we refund month 2."],
] as const;

function Cta({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <LinkButton href="/signup" className="min-h-12 px-6 text-base">Start free trial</LinkButton>
      <p className="mt-2 text-sm text-slate">14 days free, no card needed.</p>
    </div>
  );
}

export default async function Landing() {
  if (await getUser()) redirect("/leads");
  const counter = await liveCounter(getSql()).catch(() => ({ sales: 0 }));
  return (
    <>
      <section className="mx-auto grid max-w-5xl items-center gap-8 px-4 pb-12 pt-12 md:grid-cols-[1.1fr_1fr] md:pt-16">
        <div>
          <p className="text-sm text-signal-600">Lead lists for Northeast Ohio home-service businesses</p>
          <h1 className="mt-2 text-title font-extrabold leading-tight tracking-tight md:text-hero">
            The homes in your ZIP codes most likely to need a new roof or furnace, ranked every week.
          </h1>
          <p className="mt-4 text-lg text-slate">Built from public records, with the reason behind every home. Mail the best ones a postcard in two taps.</p>
          <Cta className="mt-6" />
          <p className="mt-4 text-sm"><Link href="/sample" className="focus-ring text-navy underline underline-offset-2">See a sample for your ZIP</Link></p>
        </div>
        <ProductShot />
      </section>

      {counter.sales > 0 ? (
        <section className="border-y border-line bg-white" aria-label="Live from public records">
          <p className="mx-auto max-w-5xl px-4 py-4 text-sm text-slate">
            <span className="num text-lg font-semibold text-navy">{counter.sales.toLocaleString("en-US")}</span>{" "}
            single-family homes sold in Cuyahoga County in the last 30 days. Every one is a lead for someone.
          </p>
        </section>
      ) : null}

      <section className="mx-auto grid max-w-5xl items-center gap-8 px-4 py-12 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">Every home comes with its reasons</h2>
          <p className="mt-2 text-slate">Age, recent sales, permits that are overdue, code violations, neighbors pulling permits. Each reason links to the public record, so you know what to say at the door.</p>
        </div>
        <div className="rounded-[10px] border border-line bg-white p-6">
          <div className="mb-4 flex items-center gap-4"><ScoreChip score={94} size="lg" /><div><div className="font-semibold">24xx Elmwood Ave</div><div className="text-sm text-slate">Lakewood, OH 44107</div></div></div>
          <h3 className="mb-2 text-sm font-semibold">Why this home</h3>
          <ul className="space-y-1 text-sm">{REASONS.map((r) => <li key={r} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-signal" aria-hidden />{r}</li>)}</ul>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl items-center gap-8 px-4 py-12 md:grid-cols-2">
        <div className="md:order-2">
          <h2 className="text-lg font-semibold">Mail them a postcard without leaving the list</h2>
          <p className="mt-2 text-slate">Your logo, your offer, addressed to "Current Resident". Credits are included with Pro, and anything you send can be canceled for 15 minutes.</p>
        </div>
        <div className="md:order-1">
          <PostcardPreview business="Lakeshore Roofing" headline="A roof check before winter, on us" offer="Free roof inspection" phone="(216) 555-0142" website="lakeshoreroofing.example" />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-12">
        <h2 className="mb-4 text-lg font-semibold">Built for home-service trades</h2>
        <ul className="flex flex-wrap gap-2">
          {TRADES.map((t) => (
            <li key={t.key}><Link href={`/sample?trade=${t.key}`} className="focus-ring tap inline-flex items-center rounded-full border border-line bg-white px-4 text-sm hover:border-navy/30">{t.label}</Link></li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-16">
        <h2 className="mb-4 text-lg font-semibold">Questions</h2>
        <div className="divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="py-4">
              <summary className="focus-ring cursor-pointer list-none font-semibold">{q}</summary>
              <p className="mt-2 text-sm text-slate">{a}</p>
            </details>
          ))}
        </div>
        <Cta className="mt-8" />
        <p className="mt-4 text-sm"><Link href="/pricing" className="text-navy underline underline-offset-2">See pricing</Link> · <Link href="/coverage" className="text-navy underline underline-offset-2">See coverage</Link></p>
      </section>
    </>
  );
}
