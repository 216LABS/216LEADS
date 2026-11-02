// Customer email (spec 12): React Email templates, the provider, links and the send log.
import { createHmac, timingSafeEqual } from "node:crypto";
import { render } from "@react-email/components";
import type { ReactElement } from "react";
import { optionalEnv, type Sql } from "@216leads/db";
import { basePath } from "@216leads/shared";
import { emailFromEnv, type EmailMessage, type EmailProvider, type SendResult } from "./provider";

export { emailFromEnv, outbox, type EmailMessage, type EmailProvider, type SendResult } from "./provider";
export { Digest, digestSubject, type DigestLead, type DigestProps } from "./templates/digest";
export { AutoMailSummary, Invite, MailBatch, PaymentFailed, TrialEnding, Welcome } from "./templates/transactional";

/** Absolute link into the app: APP_BASE_URL (origin) + base path + path. */
export function appUrl(path: string): string {
  const origin = (optionalEnv("APP_BASE_URL") ?? "http://localhost:3000").replace(/\/$/, "");
  return `${origin}${basePath()}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function renderEmail(el: ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([render(el), render(el, { plainText: true })]);
  return { html, text };
}

function linkSecret(): string {
  return optionalEnv("EMAIL_LINK_SECRET") ?? optionalEnv("CRON_SECRET") ?? "216leads-local-email-links";
}

/** Signed one-tap digest unsubscribe token for one org + address (no login needed). */
export function unsubscribeToken(orgId: string, email: string): string {
  const payload = Buffer.from(JSON.stringify({ o: orgId, e: email.toLowerCase() })).toString("base64url");
  const sig = createHmac("sha256", linkSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readUnsubscribeToken(token: string): { orgId: string; email: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const want = createHmac("sha256", linkSecret()).update(payload).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const v = JSON.parse(Buffer.from(payload, "base64url").toString()) as { o: string; e: string };
    return typeof v.o === "string" && typeof v.e === "string" ? { orgId: v.o, email: v.e } : null;
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
      to, subject: o.subject, html, text, stream: o.stream ?? "transactional", headers: o.headers, tag: o.kind,
    });
    await sql`update email_log set via = ${res.via}, ref = ${res.ref}, sent_at = now() where id = ${claim.id}`;
    return res;
  } catch (e) {
    // Release the claim so the next run retries.
    await sql`delete from email_log where id = ${claim.id}`;
    throw e;
  }
}
