/** @jsxRuntime automatic */
/** @jsxImportSource react */
// Weekly digest (spec 12): top 10 leads, counts by trigger, competitor of the week, one-tap links.
import { Heading, Link, Section, Text } from "@react-email/components";
import { button, C, Layout, muted, p } from "./layout";

export interface DigestLead {
  url: string;
  address: string;
  town: string;
  score: number;
  reason: string | null;
  trigger: string | null;
}

export interface DigestProps {
  orgName: string;
  /** Trade key, e.g. "roofing". */
  trade: string;
  topTown: string;
  total: number;
  newThisWeek: number;
  leads: DigestLead[];
  triggers: { label: string; count: number; url: string }[];
  competitor: { name: string; count: number } | null;
  leadsUrl: string;
  unsubscribeUrl: string;
}

/** Who the home needs, for the subject line ("need a roofer"). Trade keys from the presets. */
const TRADE_NOUN: Record<string, string> = {
  roofing: "a roofer", hvac: "an HVAC tech", plumbing: "a plumber", electrical: "an electrician", lawn_care: "lawn care",
  tree: "a tree service", painting: "a painter", gutters: "gutter work", siding: "siding work", remodel: "a remodeler",
  pest: "pest control", septic: "septic service", waterproofing: "waterproofing", fence: "a fence", new_movers: "a welcome",
};

export function digestSubject(d: Pick<DigestProps, "newThisWeek" | "total" | "topTown" | "trade">): string {
  const n = d.newThisWeek || d.total;
  const what = TRADE_NOUN[d.trade] ?? "your services";
  return `${n.toLocaleString("en-US")} home${n === 1 ? " needs" : "s need"} ${what} in ${d.topTown} this week`;
}

export function Digest(d: DigestProps) {
  return (
    <Layout preview={`${d.newThisWeek} new this week. Top: ${d.leads[0]?.address ?? "see your list"}`} unsubscribeUrl={d.unsubscribeUrl}>
      <Heading as="h1" style={{ fontSize: 20, lineHeight: "26px", margin: "0 0 8px" }}>{digestSubject(d)}</Heading>
      <Text style={muted}>
        {d.orgName}: {d.total.toLocaleString("en-US")} homes on your list, {d.newThisWeek.toLocaleString("en-US")} new or with something new this week.
      </Text>

      {d.triggers.length ? (
        <Section style={{ margin: "8px 0 16px" }}>
          {d.triggers.map((t) => (
            <Link key={t.label} href={t.url} style={{ display: "inline-block", margin: "0 8px 8px 0", padding: "6px 10px", borderRadius: 999, backgroundColor: "#FDEBDD", color: "#B84A0C", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              {t.label}: {t.count}
            </Link>
          )).flatMap((el, i) => (i ? [" ", el] : [el]))}
        </Section>
      ) : null}

      {d.leads.map((l) => (
        <Section key={l.url} style={{ borderTop: `1px solid ${C.line}`, padding: "10px 0" }}>
          <Text style={{ ...p, margin: 0 }}>
            <Link href={l.url} style={{ color: C.navy, fontWeight: 700, textDecoration: "none" }}>{l.address}</Link>
            <span style={{ color: C.slate }}> · {l.town} · score </span>
            <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 6, backgroundColor: l.score >= 80 ? C.orange : C.navy, color: "#fff", fontWeight: 700, fontSize: 13 }}>
              {l.score}
            </span>
          </Text>
          {l.trigger || l.reason ? <Text style={{ ...muted, margin: "4px 0 0" }}>{[l.trigger, l.reason].filter(Boolean).join(" · ")}</Text> : null}
        </Section>
      ))}

      {d.competitor ? (
        <Text style={{ ...p, marginTop: 16 }}>
          <strong>Competitor of the week:</strong> {d.competitor.name} pulled {d.competitor.count} permit{d.competitor.count === 1 ? "" : "s"} in your area.
        </Text>
      ) : null}
      <Section style={{ marginTop: 16 }}>
        <Link href={d.leadsUrl} style={button}>Open my leads</Link>
      </Section>
    </Layout>
  );
}
