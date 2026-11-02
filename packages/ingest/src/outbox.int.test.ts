// Issue #40: outside production every email lands in the email_outbox table, not on disk, so a
// Vercel preview (read-only filesystem) can send and QA can read what went out at /admin/outbox.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAll, getDirectSql, repoRoot } from "@216leads/db";
import { Digest, emailFromEnv, Invite, sendEmail } from "@216leads/email";
import { sendOpsEmail } from "./notify";

const sql = getDirectSql();
const tag = `outbox-${Date.now()}`;
const dir = join(repoRoot(), ".data", "outbox");
const files = () => (existsSync(dir) ? readdirSync(dir).length : 0);
let saved: Record<string, string | undefined> = {};

beforeAll(() => {
  saved = { APP_ENV: process.env.APP_ENV, RESEND_API_KEY: process.env.RESEND_API_KEY, EMAIL_OUTBOX: process.env.EMAIL_OUTBOX };
  process.env.APP_ENV = "staging";
  process.env.RESEND_API_KEY = ["re", "unit", "fixture"].join("_"); // a key is set, but staging never sends
  delete process.env.EMAIL_OUTBOX;
});

afterAll(async () => {
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  await sql`delete from email_outbox where subject like ${`%${tag}%`} or text like ${`%${tag}%`}`;
  await sql`delete from email_log where dedupe_key like ${`${tag}%`}`;
  await closeAll();
});

describe("staging email sink (issue #40)", () => {
  it("staging with a key still uses the database outbox", () => {
    expect(emailFromEnv().name).toBe("email_outbox");
  });

  it("a digest and an invite become two email_outbox rows and no files", async () => {
    const before = files();
    const digest = createElement(Digest, {
      orgName: "Outbox Roofing", trade: "roofing", topTown: "Lakewood", total: 3, newThisWeek: 1,
      leads: [{ url: "https://example.test/l/1", address: "1200 Test Ave", town: "Lakewood", score: 90, reason: "No roof permit on record since 2011", trigger: null }],
      triggers: [], competitor: null, leadsUrl: "https://example.test/leads", unsubscribeUrl: "https://example.test/unsub",
    });
    await sendEmail(sql, { orgId: null, kind: "digest", dedupeKey: `${tag}-digest`, to: ["qa@example.test"], subject: `Digest ${tag}`, element: digest, stream: "digest" });
    await sendEmail(sql, { orgId: null, kind: "invite", dedupeKey: `${tag}-invite`, to: ["new@example.test"], subject: `Invite ${tag}`, element: createElement(Invite, { orgName: "Outbox Roofing", inviteUrl: "https://example.test/invite/x" }) });
    const rows = await sql<{ subject: string; to_emails: string[]; reply_to: string | null; tag: string; html: string }[]>`
      select subject, to_emails, reply_to, tag, html from email_outbox where subject like ${`%${tag}%`} order by id`;
    expect(rows.map((r) => r.tag)).toEqual(["digest", "invite"]);
    expect(rows[1]!.to_emails).toEqual(["new@example.test"]);
    expect(rows[0]!.reply_to).toBeTruthy(); // support reply-to (issue #7)
    expect(rows[0]!.html).toContain("216");
    const log = await sql<{ via: string; ref: string }[]>`select via, ref from email_log where dedupe_key like ${`${tag}%`}`;
    expect(log.every((l) => l.via === "outbox" && l.ref.startsWith("email_outbox:"))).toBe(true);
    expect(files()).toBe(before);
  });

  it("ops alerts use the same sink", async () => {
    const before = files();
    const r = await sendOpsEmail({ subject: `Ingest stale ${tag}`, text: `watchdog ${tag}`, to: ["ops@example.test"] });
    expect(r.ref).toMatch(/^email_outbox:/);
    expect(files()).toBe(before);
  });
});
