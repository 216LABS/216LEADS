import { describe, expect, it } from "vitest";
import { providerFailure } from "./provider-errors";

const stripe = (type: string, message = "Invalid API Key provided: sk_test_****") =>
  Object.assign(new Error(message), { type, statusCode: 401 });

describe("providerFailure (issue #72)", () => {
  it("says billing is down when Stripe rejects our key, and logs the type", () => {
    const f = providerFailure(stripe("StripeAuthenticationError"))!;
    expect(f.status).toBe(503);
    expect(f.message).toMatch(/Billing isn't working/);
    expect(f.log).toMatch(/^stripe StripeAuthenticationError 401/);
  });

  it("passes a card decline through", () => {
    expect(providerFailure(stripe("StripeCardError", "Your card was declined."))).toMatchObject({ status: 402, message: "Your card was declined." });
  });

  it("says printing is down when Lob rejects our key", () => {
    const f = providerFailure(new Error('Lob 401: {"error":{"message":"Your API key is not valid"}}'))!;
    expect(f.status).toBe(503);
    expect(f.message).toMatch(/Postcard printing isn't working/);
    expect(f.log).toMatch(/^lob Lob 401/);
  });

  it("leaves other errors to the generic handler", () => {
    expect(providerFailure(new Error("boom"))).toBeNull();
    expect(providerFailure("boom")).toBeNull();
  });
});
