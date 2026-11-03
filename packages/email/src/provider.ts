// Customer email provider (spec 12, decision 10). Resend in production; everywhere else, or with
// no key, the rendered message goes to the `email_outbox` table (issue #40; /admin/outbox shows it)
// so nothing reaches a real inbox (D1). `EMAIL_OUTBOX=file` writes .data/outbox files instead (local only).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSql, optionalEnv, repoRoot, type Sql } from "@216leads/db";
import { appEnv, liveSendsAllowed } from "@216leads/shared";

export interface EmailMessage {
  to: string[];
  subject: string;
  html: string;
  text: string;
  /** "digest" uses the digest sender; everything else the transactional one. */
  stream: "digest" | "transactional";
  headers?: Record<string, string>;
  replyTo?: string;
  /** Shown in the outbox file name. */
  tag: string;
}

export interface SendResult { via: "resend" | "outbox"; ref: string }

export interface EmailProvider {
  name: string;
  send(msg: EmailMessage): Promise<SendResult>;
}

function resend(key: string): EmailProvider {
  return {
    name: "resend",
    async send(msg) {
      const from = msg.stream === "digest"
        ? optionalEnv("RESEND_FROM_DIGEST") ?? "216 HomeSignal <digest@mail.216labs.dev>"
        : optionalEnv("RESEND_FROM_TRANSACTIONAL") ?? "216 HomeSignal <hello@mail.216labs.dev>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers, reply_to: msg.replyTo }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return { via: "resend", ref: ((await res.json()) as { id: string }).id };
    },
  };
}

export function outbox(dir = join(repoRoot(), ".data", "outbox")): EmailProvider {
  return {
    name: "outbox",
    async send(msg) {
      mkdirSync(dir, { recursive: true });
      const base = `${new Date().toISOString().replace(/[:.]/g, "-")}-${msg.tag.replace(/[^a-z0-9_-]/gi, "")}`;
      const head = [`To: ${msg.to.join(", ")}`, ...(msg.replyTo ? [`Reply-To: ${msg.replyTo}`] : []), `Subject: ${msg.subject}`, ...Object.entries(msg.headers ?? {}).map(([k, v]) => `${k}: ${v}`)].join("\n");
      writeFileSync(join(dir, `${base}.html`), msg.html);
      writeFileSync(join(dir, `${base}.txt`), `${head}\n\n${msg.text}\n`);
      return { via: "outbox", ref: join(dir, `${base}.html`) };
    },
  };
}

/** The database sink: works on read-only serverless filesystems (staging previews). */
export function dbOutbox(sql: () => Sql = getSql): EmailProvider {
  return {
    name: "email_outbox",
    async send(msg) {
      const [row] = await sql()<{ id: string }[]>`
        insert into email_outbox (to_emails, reply_to, subject, html, text, headers, tag)
        values (${msg.to}, ${msg.replyTo ?? null}, ${msg.subject}, ${msg.html}, ${msg.text}, ${sql().json((msg.headers ?? {}) as never)}, ${msg.tag})
        returning id::text`;
      return { via: "outbox", ref: `email_outbox:${row!.id}` };
    },
  };
}

/** Resend only in production with a key; otherwise the database outbox (or files with EMAIL_OUTBOX=file). */
export function emailFromEnv(): EmailProvider {
  const key = optionalEnv("RESEND_API_KEY");
  if (key && liveSendsAllowed(appEnv())) return resend(key);
  return optionalEnv("EMAIL_OUTBOX") === "file" ? outbox() : dbOutbox();
}
