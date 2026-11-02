import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BRAND, titleCase } from "@216leads/shared";
import { requireOrg } from "@/lib/session";
import { getLead, type LeadFacts, type TimelineItem } from "@/lib/leads";
import { track } from "@/lib/events";
import { ReasonList, ScoreChip, TriggerPill } from "@/components/lead-bits";
import { Card, LinkButton } from "@/components/ui";
import { CopyButton, LeadStatus, NoteBox } from "./lead-actions";

export const metadata = { title: "Lead" };

const money = (n: number | null) => (n === null ? null : `$${n.toLocaleString("en-US")}`);
const WATER: Record<string, string> = { MUN: "City water", PVT: "Private well", N: "None" };
const SEWER: Record<string, string> = { SNS: "City sewer", SAN: "City sewer", SP: "Septic", SPS: "Septic", ST: "Storm", N: "None" };

function facts(f: LeadFacts): [string, string | null][] {
  return [
    ["Year built", f.year_built ? String(f.year_built) : null],
    ["Living area", f.living_sqft ? `${f.living_sqft.toLocaleString("en-US")} sq ft` : null],
    ["Style", f.style ? titleCase(f.style) : null],
    ["Lot", f.lot_acres ? `${f.lot_acres.toFixed(2)} acres` : null],
    ["Value", money(f.market_value)],
    ["Last sale", f.last_sale_date ? `${f.last_sale_date}${f.last_sale_price ? ` · ${money(f.last_sale_price)}` : ""}` : null],
    ["Heat", f.gas_service === null ? null : f.gas_service ? "Gas line" : "No gas line"],
    ["Water / sewer", [f.water_source ? WATER[f.water_source] ?? f.water_source : null, f.sewer_type ? SEWER[f.sewer_type] ?? f.sewer_type : null].filter(Boolean).join(" · ") || null],
    ["Garage", f.garage_type ? titleCase(f.garage_type) : null],
    ["Tree canopy", f.canopy_pct === null ? null : `${Math.round(f.canopy_pct)}%`],
    ["Flood zone", f.flood_zone ? `${f.flood_zone}${f.in_sfha ? " (high risk)" : ""}` : null],
  ];
}

const DOT: Record<TimelineItem["kind"], string> = {
  permit: "bg-navy", sale: "bg-signal", violation: "bg-lost", public: "bg-slate", note: "bg-won", mail: "bg-[#5b2a91]", status: "bg-line",
};

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { org, user } = await requireOrg();
  const lead = await getLead(org.id, (await params).id);
  if (!lead) notFound();
  await track("lead_viewed", { orgId: org.id, userId: user.id }, { lead_id: lead.id });

  return (
    <div className="space-y-4">
      <Link href="/leads" className="focus-ring inline-flex items-center gap-1 text-sm font-semibold text-slate hover:text-navy">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Leads
      </Link>
      <div className="flex flex-wrap items-start gap-4">
        <ScoreChip score={lead.score} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="num text-2xl font-bold">{titleCase(lead.addr_line)}</h1>
          <p className="text-slate">{titleCase(lead.city)}, OH {lead.zip}</p>
          <div className="mt-2"><TriggerPill label={lead.trigger_label} date={lead.trigger_date} /></div>
        </div>
        <div className="flex items-end gap-2">
          <LeadStatus id={lead.id} status={lead.status} wonAmount={lead.won_amount} lostReason={lead.lost_reason} />
          <LinkButton href={`/mail/send?leads=${lead.id}`}>Mail</LinkButton>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 font-bold">Why this home</h2>
            <ReasonList reasons={lead.reasons} links />
          </Card>
          {lead.pitch ? (
            <Card className="p-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="font-bold">Suggested pitch</h2>
                <CopyButton text={lead.pitch} />
              </div>
              <p className="text-slate">{lead.pitch}</p>
            </Card>
          ) : null}
          <Card className="p-5">
            <h2 className="mb-3 font-bold">Timeline</h2>
            <NoteBox id={lead.id} />
            {lead.timeline.length ? (
              <ol className="mt-4 space-y-3">
                {lead.timeline.map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[t.kind]}`} aria-hidden />
                    <div className="min-w-0 text-sm">
                      <div>
                        <span className="num text-xs text-slate">{t.at.slice(0, 10)}</span>{" "}
                        {t.url ? <a href={t.url} target="_blank" rel="noreferrer" className="font-semibold underline decoration-line underline-offset-2">{t.title}</a> : <span className="font-semibold">{t.title}</span>}
                      </div>
                      {t.detail ? <p className="whitespace-pre-line break-words text-slate">{t.detail}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-3 text-sm text-slate">No public records at this address yet.</p>}
          </Card>
        </div>
        <Card className="h-fit p-5">
          <h2 className="mb-3 font-bold">Home facts</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {facts(lead.facts).filter(([, v]) => v).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-slate">{BRAND.disclaimer}</p>
        </Card>
      </div>
    </div>
  );
}
