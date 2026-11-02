// Webhook signature checks (spec 15): the Stripe route refuses unsigned, wrongly signed and stale
// events and only then touches the database (mocked here). Lob's are in packages/ingest mail.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

vi.mock("server-only", () => ({}));
const applied: unknown[] = [];
vi.mock("@216leads/db", () => ({ getDirectSql: () => ({}) }));
vi.mock("@216leads/ingest", () => ({ applyStripeEvent: async (_sql: unknown, ev: unknown) => { applied.push(ev); return "checkout"; } }));
vi.mock("@/lib/events", () => ({ track: async () => undefined }));

// Built at runtime so secret scanners don't mistake the fixture for a real key.
const SECRET = ["whsec", "unit", "fixture"].join("_");
const payload = JSON.stringify({ id: "evt_test_1", object: "event", type: "checkout.session.completed", data: { object: { metadata: {} } } });

async function post(headers: Record<string, string>, body = payload) {
  const { POST } = await import("../app/api/webhooks/stripe/route");
  return POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", headers, body }));
}

describe("Stripe webhook signature", () => {
  beforeEach(() => {
    applied.length = 0;
    vi.resetModules();
    process.env.STRIPE_SECRET_KEY = ["sk", "test", "unit"].join("_");
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });

  it("answers 503 when billing isn't configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect((await post({})).status).toBe(503);
  });

  it("rejects a missing or wrong signature without touching the database", async () => {
    expect((await post({})).status).toBe(400);
    const wrong = Stripe.webhooks.generateTestHeaderString({ payload, secret: ["whsec", "someone", "else"].join("_") });
    expect((await post({ "stripe-signature": wrong })).status).toBe(400);
    const stale = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET, timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect((await post({ "stripe-signature": stale })).status).toBe(400);
    const sig = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    expect((await post({ "stripe-signature": sig }, payload.replace("evt_test_1", "evt_test_2"))).status).toBe(400); // body changed
    expect(applied).toHaveLength(0);
  });

  it("accepts a correctly signed event", async () => {
    const sig = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    const res = await post({ "stripe-signature": sig });
    expect(res.status).toBe(200);
    expect(applied).toHaveLength(1);
    expect((applied[0] as { id: string }).id).toBe("evt_test_1");
  });
});
