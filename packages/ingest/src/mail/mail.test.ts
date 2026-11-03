import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { loadEnv } from "@216leads/db";
import { LiveMailRefusedError, lobProvider } from "./provider";
import { missingLinkConfig } from "./send";
import { optoutDisplayUrl, personalize, renderPostcard, utmUrl } from "./templates";

describe("postcards", () => {
  // The printed opt-out address follows APP_BASE_URL (tested below); these use the brand default.
  beforeEach(() => {
    loadEnv(); // the root .env loads lazily; load it first so the delete sticks
    delete process.env.APP_BASE_URL;
  });

  it("render the opt-out line, the offer and a QR code; never a person's name", async () => {
    const { front, back } = await renderPostcard("neighbors", {
      business: "Acme Roofing", headline: "Your neighbors are re-roofing.", offer: "$150 off", expiry: "Dec 31", phone: "(216) 555-0100",
      website: "acme.example", logoUrl: null, returnAddress: "1 Main St, Lakewood, OH 44107",
    });
    expect(front).toContain("Your neighbors are re-roofing.");
    expect(back).toContain("To stop mail: 216labs.dev/homesignal/optout");
    expect(back).toContain("$150 off");
    expect(back).toContain("<svg");
  });

  it("escapes HTML in user fields", async () => {
    const { back } = await renderPostcard("welcome", {
      business: "X", headline: "h", offer: "<script>alert(1)</script>", expiry: null, phone: "1", website: null, logoUrl: null, returnAddress: "a",
    });
    expect(back).not.toContain("<script>");
  });

  it("personalizes per home and tags the site link", () => {
    expect(personalize("Built in {year_built}? Time for a roof check.", { street: "Elm Ave", year_built: 1931 })).toBe("Built in 1931? Time for a roof check.");
    expect(personalize("Built in {year_built}? Time for a roof check.", { street: null, year_built: null })).toBe("Time for a roof check.");
    expect(utmUrl("acme.example", "checkup")).toBe("https://acme.example/?utm_source=216homesignal&utm_medium=postcard&utm_campaign=checkup");
  });
});

describe("Lob provider", () => {
  it("refuses live keys and LOB_ENV=live (decision 12)", () => {
    expect(() => lobProvider("live_abc")).toThrow(LiveMailRefusedError);
    process.env.LOB_ENV = "live";
    expect(() => lobProvider("test_abc")).toThrow(LiveMailRefusedError);
    process.env.LOB_ENV = "test";
  });

  it("verifies webhook signatures and maps statuses", () => {
    process.env.LOB_WEBHOOK_SECRET = "whsec_test";
    const p = lobProvider("test_abc");
    const raw = JSON.stringify({ event_type: { id: "postcard.returned_to_sender" }, body: { id: "psc_1" }, date_created: "2026-11-02T00:00:00Z" });
    const ts = "1700000000";
    const sig = createHmac("sha256", "whsec_test").update(`${ts}.${raw}`).digest("hex");
    expect(p.verifyWebhook(raw, new Headers({ "lob-signature": sig, "lob-signature-timestamp": ts }))).toMatchObject({ providerId: "psc_1", status: "returned" });
    expect(p.verifyWebhook(raw, new Headers({ "lob-signature": "0".repeat(64), "lob-signature-timestamp": ts }))).toBeNull();
  });
});

describe("printed opt-out address (issue #1)", () => {
  it("comes from APP_BASE_URL and the base path, falling back to the brand domain", () => {
    loadEnv();
    const saved = { a: process.env.APP_BASE_URL, b: process.env.NEXT_PUBLIC_BASE_PATH };
    delete process.env.APP_BASE_URL;
    expect(optoutDisplayUrl()).toBe("216labs.dev/homesignal/optout");
    process.env.APP_BASE_URL = "https://216labs.dev";
    process.env.NEXT_PUBLIC_BASE_PATH = "/homesignal";
    expect(optoutDisplayUrl()).toBe("216labs.dev/homesignal/optout");
    process.env.APP_BASE_URL = "https://homesignal-pr-12.vercel.app/";
    expect(optoutDisplayUrl()).toBe("homesignal-pr-12.vercel.app/homesignal/optout");
    if (saved.a === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = saved.a;
    if (saved.b === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH; else process.env.NEXT_PUBLIC_BASE_PATH = saved.b;
  });
});

describe("missingLinkConfig (auto-mail from the daily pipeline)", () => {
  it("names what production needs to build print and email links", () => {
    expect(missingLinkConfig({ APP_ENV: "production" })).toEqual(["APP_BASE_URL", "NEXT_PUBLIC_BASE_PATH", "EMAIL_LINK_SECRET"]);
    expect(missingLinkConfig({ APP_ENV: "production", APP_BASE_URL: "https://www.216labs.dev", NEXT_PUBLIC_BASE_PATH: "/homesignal", EMAIL_LINK_SECRET: "x".repeat(32) })).toEqual([]);
  });

  it("doesn't block local or staging runs", () => {
    expect(missingLinkConfig({ APP_ENV: "staging" })).toEqual([]);
    expect(missingLinkConfig({})).toEqual([]);
  });
});
