import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LiveMailRefusedError, lobProvider } from "./provider";
import { personalize, renderPostcard, utmUrl } from "./templates";

describe("postcards", () => {
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
