import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { agoPhrase, BRAND, daysBetween, floodZoneText, homeStyle, planLimits, titleCase, todayEt } from "@216leads/shared";
import { requireOrg } from "@/lib/session";
import { getLead, type LeadFacts, type TimelineItem } from "@/lib/leads";
import { track } from "@/lib/events";
import { ReasonList, ScoreChip, TriggerPill } from "@/components/lead-bits";
import { buttonClass, Card, LinkButton } from "@/components/ui";
import { CopyButton, LeadStatus, NoteBox } from "./lead-actions";

export const metadata = { title: "Lead" };

const money = (n: number | null) => (n === null ? null : `$${n.toLocaleString("en-US")}`);
const WATER: Record<string, string> = { MUN: "City water", PVT: "Private well", N: "None" };
const SEWER: Record<string, string> = { SNS: "City sewer", SAN: "City sewer", SP: "Septic", SPS: "Septic", ST: "Storm", N: "None" };

/** "6 days ago" for the last month, then "Oct 28, 2026" (issue #59: human dates). */
function humanDate(iso: string): string {
  const day = iso.slice(0, 10);
  if (daysBetween(day, todayEt()) <= 30) return agoPhrase(day);
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Label, value, and whether the value is a number (mono) or words (sans). */
function facts(f: LeadFacts): [string, string | null, boolean][] {
  return [
    ["Year built", f.year_built ? String(f.year_built) : null, true],
    ["Living area", f.living_sqft ? `${f.living_sqft.toLocaleString("en-US")} sq ft` : null, true],
    ["Style", homeStyle(f.style), false],
    ["Lot", f.lot_acres ? `${f.lot_acres.toFixed(2)} acres` : null, true],
    ["Value", money(f.market_value), true],
    ["Last sale", f.last_sale_date ? `${humanDate(f.last_sale_date)}${f.last_sale_price ? ` · ${money(f.last_sale_price)}` : ""}` : null, false],
    ["Heat", f.gas_service === null ? null : f.gas_service ? "Gas line" : "No gas line", false],
    ["Water / sewer", [f.water_source ? WATER[f.water_source] ?? f.water_source : null, f.sewer_type ? SEWER[f.sewer_type] ?? f.sewer_type : null].filter(Boolean).join(" · ") || null, false],
    ["Garage", f.garage_type ? titleCase(f.garage_type) : null, false],
    ["Tree canopy", f.canopy_pct === null ? null : `${Math.round(f.canopy_pct)}%`, true],
    ["Flood zone", floodZoneText(f.flood_zone, f.in_sfha), false],
  ];
}

const DOT: Record<TimelineItem["kind"], string> = {
  permit: "bg-navy", sale: "bg-signal", violation: "bg-lost", public: "bg-slate", note: "bg-won", mail: "bg-quoted", status: "bg-line",
};

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { org, user } = await requireOrg();
  const lead = await getLead(org.id, (await params).id);
  if (!lead) notFound();
  await track("lead_viewed", { orgId: org.id, userId: user.id }, { lead_id: lead.id });
  const showRing = planLimits(org.plan).marketTools;

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <Link href="/leads" className="focus-ring inline-flex items-center gap-1 text-sm text-slate hover:text-navy">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Leads
      </Link>
      <div className="flex flex-wrap items-start gap-4">
        <ScoreChip score={lead.score} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-title font-semibold leading-tight">{titleCase(lead.addr_line)}</h1>
          <p className="text-slate">{titleCase(lead.city)}, OH {lead.zip}</p>
          <div className="mt-2"><TriggerPill label={lead.trigger_label} date={lead.trigger_date} /></div>
        </div>
        {/* One element for both layouts: a sticky bar above the tab bar on phones, inline on desktop. */}
        <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-20 flex items-end gap-2 border-t border-line bg-white p-2 md:static md:z-auto md:border-0 md:bg-transparent md:p-0">
          <div className="min-w-0 flex-1 md:w-44 md:flex-none">
            <LeadStatus id={lead.id} status={lead.status} wonAmount={lead.won_amount} lostReason={lead.lost_reason} />
          </div>
          <Link href={`/mail/send?leads=${lead.id}`} className={buttonClass("primary", "min-h-12 flex-1 md:min-h-11 md:flex-none")}>Mail</Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card className="border-signal/30 p-6">
            <h2 className="mb-4 text-lg font-semibold">Why this home</h2>
            <ReasonList reasons={lead.reasons} links />
            {showRing ? <LinkButton variant="secondary" className="mt-4" href={`/map?ring=${lead.parcel_key}`}>Mail the neighbors</LinkButton> : null}
          </Card>
          {lead.pitch ? (
            <section>
              <div className="mb-2 flex items-center justify-between gap-4">
                <h2 className="font-semibold">Suggested pitch</h2>
                <CopyButton text={lead.pitch} />
              </div>
              <p className="text-slate">{lead.pitch}</p>
            </section>
          ) : null}
          <section>
            <h2 className="mb-2 font-semibold">Timeline</h2>
            <NoteBox id={lead.id} />
            {lead.timeline.length ? (
              <ol className="mt-4 space-y-4">
                {lead.timeline.map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${DOT[t.kind]}`} aria-hidden />
                    <div className="min-w-0 text-sm">
                      <div>
                        <time dateTime={t.at} className="text-xs text-slate">{humanDate(t.at)}</time>{" "}
                        {t.url ? <a href={t.url} target="_blank" rel="noreferrer" className="font-semibold underline decoration-line underline-offset-2">{t.title}</a> : <span className="font-semibold">{t.title}</span>}
                      </div>
                      {t.detail ? <p className="whitespace-pre-line break-words text-slate">{t.detail}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-2 text-sm text-slate">No public records at this address yet.</p>}
          </section>
        </div>
        <section className="h-fit">
          <h2 className="mb-2 font-semibold">Home facts</h2>
          <dl className="divide-y divide-line text-sm">
            {facts(lead.facts).filter(([, v]) => v).map(([k, v, isNum]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-slate">{k}</dt>
                <dd className={isNum ? "num text-right" : "text-right"}>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-slate">{BRAND.disclaimer}</p>
        </section>
      </div>
    </div>
  );
}
