/** @jsxRuntime automatic */
/** @jsxImportSource react */
// Transactional emails (spec 12). Magic-link sign-in mail is sent by Supabase Auth itself.
import { Heading, Link, Section, Text } from "@react-email/components";
import { button, Layout, muted, p } from "./layout";

function Cta({ href, children }: { href: string; children: string }) {
  return <Section style={{ margin: "16px 0" }}><Link href={href} style={button}>{children}</Link></Section>;
}

export function Welcome({ orgName, leads, leadsUrl }: { orgName: string; leads: number; leadsUrl: string }) {
  return (
    <Layout preview={`${leads} homes are on your list`}>
      <Heading as="h1" style={{ fontSize: 20, margin: "0 0 8px" }}>Welcome to 216 Leads</Heading>
      <Text style={p}>{orgName} is set up. {leads.toLocaleString("en-US")} homes in your area match right now, each with the public records behind it.</Text>
      <Text style={p}>New sales post daily and Cleveland permits every morning, so check back, or watch for your weekly digest.</Text>
      <Cta href={leadsUrl}>See my leads</Cta>
    </Layout>
  );
}

export function TrialEnding({ orgName, daysLeft, billingUrl }: { orgName: string; daysLeft: number; billingUrl: string }) {
  return (
    <Layout preview={`Your trial ends in ${daysLeft} days`}>
      <Heading as="h1" style={{ fontSize: 20, margin: "0 0 8px" }}>Your free trial ends in {daysLeft} days</Heading>
      <Text style={p}>Pick a plan to keep {orgName}&rsquo;s lead list, notes and history. Nothing is charged until you choose.</Text>
      <Cta href={billingUrl}>Pick a plan</Cta>
    </Layout>
  );
}

export function PaymentFailed({ orgName, billingUrl }: { orgName: string; billingUrl: string }) {
  return (
    <Layout preview="We couldn't charge your card">
      <Heading as="h1" style={{ fontSize: 20, margin: "0 0 8px" }}>We couldn&rsquo;t charge your card</Heading>
      <Text style={p}>The last payment for {orgName} didn&rsquo;t go through. Update your card within 7 days to keep your leads and postcards running.</Text>
      <Cta href={billingUrl}>Update payment</Cta>
    </Layout>
  );
}

export function MailBatch({ count, removed, costText, cancelBy, mailUrl }: { count: number; removed: number; costText: string; cancelBy: string; mailUrl: string }) {
  return (
    <Layout preview={`${count} postcards queued`}>
      <Heading as="h1" style={{ fontSize: 20, margin: "0 0 8px" }}>{count} postcard{count === 1 ? "" : "s"} queued</Heading>
      <Text style={p}>Cost: {costText}. {removed ? `${removed} home${removed === 1 ? " was" : "s were"} left out by your mail rules and opt-outs.` : ""}</Text>
      <Text style={muted}>You can cancel until {cancelBy}. After that they go to print.</Text>
      <Cta href={mailUrl}>Review the batch</Cta>
    </Layout>
  );
}

export function AutoMailSummary({ sent, skipped, spentText, mailUrl }: { sent: number; skipped: number; spentText: string; mailUrl: string }) {
  return (
    <Layout preview={`Auto-mail sent ${sent} postcards this week`}>
      <Heading as="h1" style={{ fontSize: 20, margin: "0 0 8px" }}>Auto-mail this week</Heading>
      <Text style={p}>{sent} postcard{sent === 1 ? "" : "s"} sent, {spentText}. {skipped} home{skipped === 1 ? "" : "s"} skipped by caps, the 30-day rule or opt-outs.</Text>
      <Cta href={mailUrl}>See mail history</Cta>
    </Layout>
  );
}

export function Invite({ orgName, inviteUrl }: { orgName: string; inviteUrl: string }) {
  return (
    <Layout preview={`Join ${orgName} on 216 Leads`}>
      <Heading as="h1" style={{ fontSize: 20, margin: "0 0 8px" }}>Join {orgName} on 216 Leads</Heading>
      <Text style={p}>You&rsquo;ve been invited to the team&rsquo;s lead list. The link works for 14 days.</Text>
      <Cta href={inviteUrl}>Accept the invite</Cta>
    </Layout>
  );
}
