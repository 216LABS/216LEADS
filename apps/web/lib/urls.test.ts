// Server redirects must land on APP_BASE_URL + base path, not on the request host (issue #70).
// Behind the 216labs.dev rewrite the request arrives on the vercel.app host, as below.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let exchangeError: { message: string } | null = null;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({
  supabaseServer: async () => ({
    auth: { exchangeCodeForSession: async () => ({ error: exchangeError }), signOut: async () => ({}) },
  }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

const { appOrigin } = await import("./urls");
const { GET: callback } = await import("@/app/auth/callback/route");
const { POST: signout } = await import("@/app/auth/signout/route");
const { middleware } = await import("@/middleware");

const REWRITE_HOST = "https://homesignal-samflipppys-projects.vercel.app";
const PUBLIC = "https://www.216labs.dev/homesignal";
const KEYS = ["APP_BASE_URL", "APP_ENV", "NEXT_PUBLIC_BASE_PATH", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

const request = (path: string) => new NextRequest(`${REWRITE_HOST}/homesignal${path}`, { nextConfig: { basePath: "/homesignal" } });

beforeEach(() => {
  Object.assign(process.env, {
    APP_BASE_URL: "https://www.216labs.dev",
    APP_ENV: "production",
    NEXT_PUBLIC_BASE_PATH: "/homesignal",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  });
  exchangeError = null;
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("appOrigin", () => {
  it("uses APP_BASE_URL and the base path, ignoring the request host", () => {
    process.env.APP_BASE_URL = "https://www.216labs.dev/";
    expect(appOrigin(request("/x"))).toBe(PUBLIC);
  });

  it("falls back to the request origin only in local dev", () => {
    process.env.APP_BASE_URL = "";
    process.env.APP_ENV = "local";
    process.env.NEXT_PUBLIC_BASE_PATH = "";
    expect(appOrigin(new NextRequest("http://localhost:3000/auth/callback"))).toBe("http://localhost:3000");
  });

  it.each(["production", "staging"])("refuses to guess the origin in %s", (env) => {
    process.env.APP_ENV = env;
    delete process.env.APP_BASE_URL;
    expect(() => appOrigin(request("/x"))).toThrow(/APP_BASE_URL/);
  });
});

describe("auth callback", () => {
  it("sends the signup confirm link to onboarding on the public domain", async () => {
    const res = await callback(request("/auth/callback?code=abc&next=/onboarding"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${PUBLIC}/onboarding`);
  });

  it("keeps the query string on next", async () => {
    const res = await callback(request(`/auth/callback?code=abc&next=${encodeURIComponent("/invite/t1?x=1")}`));
    expect(res.headers.get("location")).toBe(`${PUBLIC}/invite/t1?x=1`);
  });

  it.each(["//evil.example/x", "https://evil.example/x", "/\\evil.example"])("never leaves the public domain for next=%s", async (next) => {
    const res = await callback(request(`/auth/callback?code=abc&next=${encodeURIComponent(next)}`));
    expect(new URL(res.headers.get("location")!).origin).toBe("https://www.216labs.dev");
    expect(res.headers.get("location")).toMatch(/^https:\/\/www\.216labs\.dev\/homesignal\//);
  });

  it("sends a failed exchange or a missing code to login", async () => {
    exchangeError = { message: "expired link" };
    expect((await callback(request("/auth/callback?code=abc"))).headers.get("location")).toBe(`${PUBLIC}/login?error=expired%20link`);
    expect((await callback(request("/auth/callback"))).headers.get("location")).toBe(`${PUBLIC}/login`);
  });
});

describe("other server redirects", () => {
  it("sign-out answers 303 to login on the public domain", async () => {
    const res = await signout(new NextRequest(`${REWRITE_HOST}/homesignal/auth/signout`, { method: "POST" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${PUBLIC}/login`);
  });

  it("middleware sends a signed-out app visit to login with next", async () => {
    const res = await middleware(request("/leads?status=new"));
    expect(res.headers.get("location")).toBe(`${PUBLIC}/login?next=${encodeURIComponent("/leads?status=new")}`);
  });
});
