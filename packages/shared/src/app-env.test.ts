import { afterEach, describe, expect, it } from "vitest";
import { assertKeyAllowed, isLiveKey, liveSendsAllowed, LiveKeyBlockedError, withBase, appEnv } from "./app-env";

const saved = { APP_ENV: process.env.APP_ENV, NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH };
afterEach(() => {
  process.env.APP_ENV = saved.APP_ENV;
  process.env.NEXT_PUBLIC_BASE_PATH = saved.NEXT_PUBLIC_BASE_PATH;
});

describe("live-key guard (D1)", () => {
  it("recognizes live keys", () => {
    expect(isLiveKey("stripe", "sk_live_abc")).toBe(true);
    expect(isLiveKey("stripe", "sk_test_abc")).toBe(false);
    expect(isLiveKey("lob", "live_123")).toBe(true);
    expect(isLiveKey("lob", "test_123")).toBe(false);
  });

  it("refuses live keys outside production, even when misconfigured", () => {
    expect(() => assertKeyAllowed("stripe", "sk_live_abc", "staging")).toThrow(LiveKeyBlockedError);
    expect(() => assertKeyAllowed("lob", "live_123", "local")).toThrow(LiveKeyBlockedError);
    expect(() => assertKeyAllowed("lob", "test_123", "staging")).not.toThrow();
    expect(() => assertKeyAllowed("stripe", "sk_live_abc", "production")).not.toThrow();
  });

  it("only allows real sends in production", () => {
    expect(liveSendsAllowed("production")).toBe(true);
    expect(liveSendsAllowed("staging")).toBe(false);
    expect(liveSendsAllowed("local")).toBe(false);
  });

  it("defaults to local when APP_ENV is unset or unknown", () => {
    process.env.APP_ENV = "prod";
    expect(appEnv()).toBe("local");
  });
});

describe("base path", () => {
  it("prefixes paths with the configured base path", () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/homesignal";
    expect(withBase("/api/health")).toBe("/homesignal/api/health");
    process.env.NEXT_PUBLIC_BASE_PATH = "";
    expect(withBase("/api/health")).toBe("/api/health");
  });
});
