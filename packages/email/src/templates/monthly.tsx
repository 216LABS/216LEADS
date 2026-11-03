/** @jsxRuntime automatic */
/** @jsxImportSource react */
// Monthly "what you got" summary for paying customers (issue #9). Lines for features the customer
// didn't use that month are left out, never shown as zero. No em dashes.
import { Link, Section, Text } from "@react-email/components";
import { C, Layout, muted, p } from "./layout";

export interface MonthlySummaryProps {
  /** "October" */
  month: string;
  orgName: string;
  /** Each present only when it's above zero (the job drops the rest). */
  newHomes?: number;
  contacted?: number;
  mailed?: number;
  delivered?: number;
  won?: number;
  revenue?: number;
  creditsLeft?: number;
  top: { address: string; score: number; reason: string | null; url: string }[];
  leadsUrl: string;
  unsubscribeUrl: string;
}

export function monthlySummarySubject(d: Pick<MonthlySummaryProps, "month">): string {
  return `your ${d.month} with 216 HomeSignal`;
}

const n = (x: number) => x.toLocaleString("en-US");

export function MonthlySummary(d: MonthlySummaryProps) {
  const lines: string[] = [];
  if (d.newHomes) lines.push(`${n(d.newHomes)} new home${d.newHomes === 1 ? "" : "s"} matched your area`);
  if (d.contacted) lines.push(`You reached out to ${n(d.contacted)}`);
  if (d.mailed) lines.push(`${n(d.mailed)} postcard${d.mailed === 1 ? "" : "s"} mailed${d.delivered ? `, ${n(d.delivered)} delivered so far` : ""}`);
  if (d.won) lines.push(`${n(d.won)} job${d.won === 1 ? "" : "s"} marked won${d.revenue ? `, $${n(d.revenue)} in work` : ""}`);
  if (d.creditsLeft) lines.push(`${n(d.creditsLeft)} postcard credit${d.creditsLeft === 1 ? "" : "s"} left`);
  return (
    <Layout preview={`your ${d.month} at a glance`} unsubscribeUrl={d.unsubscribeUrl} unsubscribeLabel="Unsubscribe from monthly summaries">
      <Text style={p}>here&rsquo;s {d.orgName}&rsquo;s {d.month} with 216 HomeSignal:</Text>
      {lines.length ? (
        <Section style={{ margin: "0 0 12px" }}>
          {lines.map((l) => <Text key={l} style={{ ...p, margin: "0 0 4px" }}>&bull; {l}</Text>)}
        </Section>
      ) : null}
      {d.top.length ? (
        <>
          <Text style={{ ...p, fontWeight: 700, margin: "8px 0 4px" }}>top homes for this month</Text>
          {d.top.map((h) => (
            <Section key={h.url} style={{ borderTop: `1px solid ${C.line}`, padding: "8px 0" }}>
              <Text style={{ ...p, margin: 0 }}>
                <Link href={h.url} style={{ color: C.navy, fontWeight: 700 }}>{h.address}</Link>
                <span style={{ color: C.slate }}> · score {h.score}</span>
              </Text>
              {h.reason ? <Text style={{ ...muted, margin: "2px 0 0" }}>{h.reason}</Text> : null}
            </Section>
          ))}
        </>
      ) : null}
      <Text style={{ ...p, marginTop: 16 }}><Link href={d.leadsUrl} style={{ color: C.navy, fontWeight: 700 }}>open your leads</Link></Text>
      <Text style={p}>questions or ideas? just reply.</Text>
    </Layout>
  );
}
