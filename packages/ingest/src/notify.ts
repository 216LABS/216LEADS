// Internal ops email (alerts to 216LABS staff, never customers). Sends through Resend when a
// key is configured; otherwise the message goes to the same sink as customer email outside
// production: the `email_outbox` table (issue #40), or .data/outbox files with EMAIL_OUTBOX=file.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDirectSql, optionalEnv, repoRoot } from "@216leads/db";
import { appEnv, liveSendsAllowed } from "@216leads/shared";

export interface OpsMessage {
  subject: string;
  text: string;
  /** Defaults to ALERT_EMAILS / ADMIN_EMAILS. */
  to?: string[];
}

export function opsRecipients(): string[] {
  return (optionalEnv("ALERT_EMAILS") ?? optionalEnv("ADMIN_EMAILS") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

export async function sendOpsEmail(msg: OpsMessage): Promise<{ via: "resend" | "outbox"; ref: string }> {
  const to = msg.to?.length ? msg.to : opsRecipients();
  const key = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("RESEND_FROM_TRANSACTIONAL") ?? "216 HomeSignal <hello@mail.216labs.dev>";
  const env = optionalEnv("APP_ENV") ?? "local";
  const subject = env === "production" ? msg.subject : `[${env}] ${msg.subject}`;
  // Like customer email (D1): real sends only from production.
  if (key && to.length && liveSendsAllowed(appEnv())) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text: msg.text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return { via: "resend", ref: ((await res.json()) as { id: string }).id };
  }
  if (optionalEnv("EMAIL_OUTBOX") !== "file") {
    const [row] = await getDirectSql()<{ id: string }[]>`
      insert into email_outbox (to_emails, subject, html, text, tag)
      values (${to.length ? to : ["(no ALERT_EMAILS set)"]}, ${subject}, '', ${msg.text}, 'ops') returning id::text`;
    return { via: "outbox", ref: `email_outbox:${row!.id}` };
  }
  const dir = join(repoRoot(), ".data", "outbox");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-ops.txt`);
  writeFileSync(file, `To: ${to.join(", ") || "(no ALERT_EMAILS set)"}\nSubject: ${subject}\n\n${msg.text}\n`);
  return { via: "outbox", ref: file };
}
