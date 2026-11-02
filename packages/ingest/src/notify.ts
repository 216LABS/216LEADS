// Internal ops email (alerts to 216LABS staff, never customers). Sends through Resend when a
// key is configured; otherwise writes the message to .data/outbox so local runs stay offline.
// Customer email (digest, transactional) gets its own provider in M6.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { optionalEnv, repoRoot } from "@216leads/db";

export interface OpsMessage {
  subject: string;
  text: string;
}

export function opsRecipients(): string[] {
  return (optionalEnv("ALERT_EMAILS") ?? optionalEnv("ADMIN_EMAILS") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

export async function sendOpsEmail(msg: OpsMessage): Promise<{ via: "resend" | "outbox"; ref: string }> {
  const to = opsRecipients();
  const key = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("RESEND_FROM_TRANSACTIONAL") ?? "216 Leads <hello@mail.216labs.dev>";
  const env = optionalEnv("APP_ENV") ?? "local";
  const subject = env === "production" ? msg.subject : `[${env}] ${msg.subject}`;
  if (key && to.length) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text: msg.text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return { via: "resend", ref: ((await res.json()) as { id: string }).id };
  }
  const dir = join(repoRoot(), ".data", "outbox");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-ops.txt`);
  writeFileSync(file, `To: ${to.join(", ") || "(no ALERT_EMAILS set)"}\nSubject: ${subject}\n\n${msg.text}\n`);
  return { via: "outbox", ref: file };
}
