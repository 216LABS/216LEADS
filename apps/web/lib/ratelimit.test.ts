import { describe, expect, it } from "vitest";
import { rateLimit } from "./ratelimit";

describe("rate limit (spec 13: 60 requests a minute per user)", () => {
  it("allows the limit inside the window, then refuses until it slides", () => {
    const key = `t-${Math.random()}`;
    const t0 = 1_000_000;
    for (let i = 0; i < 60; i++) expect(rateLimit(key, 60, 60_000, t0 + i)).toBe(true);
    expect(rateLimit(key, 60, 60_000, t0 + 100)).toBe(false);
    expect(rateLimit(key, 60, 60_000, t0 + 59_999)).toBe(false);
    expect(rateLimit(key, 60, 60_000, t0 + 60_001)).toBe(true); // the first hit slid out
  });

  it("keeps keys apart", () => {
    const a = `a-${Math.random()}`, b = `b-${Math.random()}`;
    expect(rateLimit(a, 1, 60_000, 5)).toBe(true);
    expect(rateLimit(a, 1, 60_000, 6)).toBe(false);
    expect(rateLimit(b, 1, 60_000, 6)).toBe(true);
  });
});
