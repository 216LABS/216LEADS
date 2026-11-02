// Customer email (spec 12): React Email templates, the provider, links and the send log.
import { createHmac, timingSafeEqual } from "node:crypto";
import { render } from "@react-email/components";
import type { ReactElement } from "react";
import { optionalEnv, type Sql } from "@216leads/db";
import { BRAND } from "@216leads/shared";
import { emailFromEnv, type EmailMessage, type EmailProvider, type SendResult } from "./provider";

export { dbOutbox, emailFromEnv, outbox, type EmailMessage, type EmailProvider, type SendResult } from "./provider";
export { Digest, digestSubject, type DigestLead, type DigestProps } from "./templates/digest";
export { AutoMailSummary, Invite, MailBatch, PaymentFailed, TrialEnding, Welcome } from "./templates/transactional";
export { TrialDay3, trialDay3Subject, type TrialDay3Props } from "./templates/day3";

export { appUrl } from "./url";

export async function renderEmail(el: ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([render(el), render(el, { plainText: true })]);
  return { html, text };
}

function linkSecret(): string {
  return optionalEnv("EMAIL_LINK_SECRET") ?? optionalEnv("CRON_SECRET") ?? "216leads-local-email-links";
}

export type UnsubscribeStream = "digest" | "lifecycle";

/** Signed one-tap unsubscribe token for one org + address + stream (no login needed). */
export function unsubscribeToken(orgId: string, email: string, stream: UnsubscribeStream = "digest"): string {
  const payload = Buffer.from(JSON.stringify({ o: orgId, e: email.toLowerCase(), s: stream })).toString("base64url");
  const sig = createHmac("sha256", linkSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readUnsubscribeToken(token: string): { orgId: string; email: string; stream: UnsubscribeStream } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const want = createHmac("sha256", linkSecret()).update(payload).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const v = JSON.parse(Buffer.from(payload, "base64url").toString()) as { o: string; e: string; s?: string };
    if (typeof v.o !== "string" || typeof v.e !== "string") return null;
    return { orgId: v.o, email: v.e, stream: v.s === "lifecycle" ? "lifecycle" : "digest" };
  } catch {
    return null;
  }
}

export interface SendOpts {
  orgId: string | null;
  kind: string;
  /** Unique per logical message; a second send with the same key is skipped. */
  dedupeKey: string;
  to: string[];
  subject: string;
  element: ReactElement;
  stream?: EmailMessage["stream"];
  headers?: Record<string, string>;
  replyTo?: string;
  provider?: EmailProvider;
}

/**
 * Render, send once and log. Returns null when this dedupe key was already sent. The log row
 * is claimed before sending so two overlapping job runs can't both send.
 */
export async function sendEmail(sql: Sql, o: SendOpts): Promise<SendResult | null> {
  const to = [...new Set(o.to.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (!to.length) return null;
  const [claim] = await sql<{ id: number }[]>`
    insert into email_log (org_id, kind, dedupe_key, to_emails, via)
    values (${o.orgId}, ${o.kind}, ${o.dedupeKey}, ${to}, 'pending')
    on conflict (dedupe_key) do nothing returning id`;
  if (!claim) return null;
  try {
    const { html, text } = await renderEmail(o.element);
    const res = await (o.provider ?? emailFromEnv()).send({
      to, subject: o.subject, html, text, stream: o.stream ?? "transactional", headers: o.headers,
      // Every email answers to support (issue #7).
      replyTo: o.replyTo ?? optionalEnv("SUPPORT_EMAIL") ?? BRAND.supportEmail, tag: o.kind,
    });
    await sql`update email_log set via = ${res.via}, ref = ${res.ref}, sent_at = now() where id = ${claim.id}`;
    return res;
  } catch (e) {
    // Release the claim so the next run retries.
    await sql`delete from email_log where id = ${claim.id}`;
    throw e;
  }
}
