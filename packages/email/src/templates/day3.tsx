/** @jsxRuntime automatic */
/** @jsxImportSource react */
// Day-3 trial check-in (issue #8). Lowercase, personal, from Sam; invites a reply. Copy lives here
// so it can be edited without touching the job. No em dashes.
import { Link, Section, Text } from "@react-email/components";
import { C, Layout, muted, p } from "./layout";

export interface TrialDay3Props {
  trade: string;
  town: string;
  homes: { address: string; score: number; reason: string | null; url: string }[];
  unsubscribeUrl: string;
}

export const SAM = "sam@216labs.dev";

export function trialDay3Subject(d: Pick<TrialDay3Props, "trade" | "town">): string {
  return `your first ${d.trade} homes in ${d.town}`;
}

export function TrialDay3(d: TrialDay3Props) {
  return (
    <Layout preview="here are your top 3 homes right now" unsubscribeUrl={d.unsubscribeUrl} unsubscribeLabel="Unsubscribe from check-ins" contact={SAM}>
      <Text style={p}>hey there, it&rsquo;s sam from 216 HomeSignal. here are your top 3 homes right now:</Text>
      {d.homes.map((h) => (
        <Section key={h.url} style={{ borderTop: `1px solid ${C.line}`, padding: "8px 0" }}>
          <Text style={{ ...p, margin: 0 }}>
            <Link href={h.url} style={{ color: C.navy, fontWeight: 700 }}>{h.address}</Link>
            <span style={{ color: C.slate }}> · score {h.score}</span>
          </Text>
          {h.reason ? <Text style={{ ...muted, margin: "2px 0 0" }}>{h.reason}</Text> : null}
        </Section>
      ))}
      <Text style={{ ...p, marginTop: 16 }}>try this today: mark 5 homes as contacted or skip the ones that look wrong. it tunes your list.</Text>
      <Text style={p}>if anything looks off, just reply. happy to do a 15 minute walkthrough.</Text>
      <Text style={p}>sam</Text>
    </Layout>
  );
}
