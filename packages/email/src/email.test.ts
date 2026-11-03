import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import {
  Digest, digestSubject, MailBatch, MonthlySummary, monthlySummarySubject, outbox, readUnsubscribeToken, renderEmail, TrialDay3, trialDay3Subject, unsubscribeToken, Welcome, type DigestProps,
} from "./index";

const digest: DigestProps = {
  orgName: "Test Roofing", trade: "roofing", topTown: "Lakewood", total: 214, newThisWeek: 37,
  leads: Array.from({ length: 10 }, (_, i) => ({
    url: `https://216labs.dev/homesignal/leads/${i}`, address: `${1200 + i} Test Ave`, town: "Lakewood", score: 90 - i,
    reason: "No roof permit on record since 2011", trigger: i % 2 ? "Just sold" : null,
  })),
  triggers: [{ label: "Just sold", count: 12, url: "https://216labs.dev/homesignal/leads?chips=sold" }],
  competitor: { name: "Acme Roofing LLC", count: 4 },
  leadsUrl: "https://216labs.dev/homesignal/leads", unsubscribeUrl: "https://216labs.dev/homesignal/api/public/unsubscribe?t=x",
};

describe("digest (spec 12)", () => {
  it("subject reads like the spec", () => {
    expect(digestSubject(digest)).toBe("37 homes need a roofer in Lakewood this week");
    expect(digestSubject({ ...digest, trade: "hvac", newThisWeek: 1 })).toBe("1 home needs an HVAC tech in Lakewood this week");
  });

  it("renders the top 10, the competitor, the footer and unsubscribe, under 100 KB", async () => {
    const { html, text } = await renderEmail(createElement(Digest, digest));
    expect(Buffer.byteLength(html)).toBeLessThan(100_000);
    for (const l of digest.leads) expect(html).toContain(l.address);
    expect(html).toContain("Acme Roofing LLC");
    expect(html).toContain("1474 Rosewood Ave");
    expect(html).toContain("Unsubscribe");
    expect(text).toContain("1200 Test Ave");
  });
});

describe("transactional templates", () => {
  it("day-3 check-in: lowercase subject, 3 homes, reply invite, no em dashes", async () => {
    expect(trialDay3Subject({ trade: "roofing", town: "Lakewood" })).toBe("your first roofing homes in Lakewood");
    const homes = [1, 2, 3].map((i) => ({ address: `${i} Elm Ave`, score: 90 - i, reason: "Sold 3 weeks ago", url: `https://a/leads/${i}` }));
    const { html, text } = await renderEmail(createElement(TrialDay3, { trade: "roofing", town: "Lakewood", homes, unsubscribeUrl: "https://a/u" }));
    for (const h of homes) expect(html).toContain(h.address);
    expect(text).toContain("just reply");
    expect(html).toContain("sam@216labs.dev");
    expect(html + text).not.toContain("\u2014");
  });

  it("render with their call to action", async () => {
    expect((await renderEmail(createElement(Welcome, { orgName: "X Co", leads: 5, leadsUrl: "https://a/leads" }))).html).toContain("See my leads");
    const batch = await renderEmail(createElement(MailBatch, { count: 3, removed: 1, costText: "$2.97", cancelBy: "3:15 PM", mailUrl: "https://a/mail" }));
    expect(batch.text.toLowerCase()).toContain("3 postcards queued");
  });
});

describe("unsubscribe tokens", () => {
  it("round-trip and reject tampering", () => {
    const t = unsubscribeToken("00000000-0000-0000-0000-000000000001", "Pat@Example.com");
    expect(readUnsubscribeToken(t)).toEqual({ orgId: "00000000-0000-0000-0000-000000000001", email: "pat@example.com", stream: "digest" });
    expect(readUnsubscribeToken(unsubscribeToken("o", "a@b.c", "lifecycle"))?.stream).toBe("lifecycle");
    const [payload] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ o: "other", e: "pat@example.com" })).toString("base64url");
    expect(readUnsubscribeToken(`${forged}.${t.split(".")[1]}`)).toBeNull();
    expect(readUnsubscribeToken(`${payload}.bad`)).toBeNull();
    expect(readUnsubscribeToken("garbage")).toBeNull();
  });
});

describe("outbox provider", () => {
  it("writes html and text files instead of sending", async () => {
    const dir = mkdtempSync(join(tmpdir(), "outbox-"));
    const r = await outbox(dir).send({ to: ["a@b.c"], subject: "Hi", html: "<p>hi</p>", text: "hi", stream: "digest", tag: "digest", headers: { "List-Unsubscribe": "<x>" } });
    expect(r.via).toBe("outbox");
    const files = readdirSync(dir);
    expect(files.some((f) => f.endsWith(".html"))).toBe(true);
    expect(readFileSync(join(dir, files.find((f) => f.endsWith(".txt"))!), "utf8")).toContain("List-Unsubscribe: <x>");
  });
});

describe("monthly summary (issue #9)", () => {
  const base = { month: "October", orgName: "Test Roofing", top: [], leadsUrl: "https://example.test/leads", unsubscribeUrl: "https://example.test/u" };

  it("subject, footer and unsubscribe; no em dashes", async () => {
    expect(monthlySummarySubject({ month: "October" })).toBe("your October with 216 HomeSignal");
    const { html, text } = await renderEmail(MonthlySummary({ ...base, newHomes: 42, mailed: 10, delivered: 7, won: 2, revenue: 18500, creditsLeft: 15 }));
    expect(text).toContain("42 new homes matched your area");
    expect(text).toContain("10 postcards mailed, 7 delivered so far");
    expect(text).toContain("2 jobs marked won, $18,500 in work");
    expect(html).toContain("1474 Rosewood Ave");
    expect(html).toContain("https://example.test/u");
    expect(`${html}${text}`).not.toContain("—");
  });

  it("leaves out lines for features not used", async () => {
    const { text } = await renderEmail(MonthlySummary({ ...base, newHomes: 3 }));
    expect(text).not.toMatch(/postcards? mailed|marked won|credits? left|reached out/i);
  });
});
