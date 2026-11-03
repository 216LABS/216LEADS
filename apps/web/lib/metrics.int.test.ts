// Issue #10: /api/admin/metrics answers 401 without an admin session or the bearer token, and
// returns the same numbers as the page with it.
import { afterAll, describe, expect, it, vi } from "vitest";
import { closeAll, getDirectSql } from "@216leads/db";
import { businessMetrics } from "@216leads/ingest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ supabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }));

const TOKEN = ["metrics", "read", "fixture", "value"].join("-");
process.env.METRICS_READ_TOKEN = TOKEN;

afterAll(async () => {
  delete process.env.METRICS_READ_TOKEN;
  await closeAll();
});

const get = async (headers: Record<string, string> = {}) => {
  const { GET } = await import("../app/api/admin/metrics/route");
  return GET(new Request("http://localhost/api/admin/metrics", { headers }));
};

describe("metrics JSON endpoint (issue #10)", () => {
  it("401 without a session or token, and with a wrong token", async () => {
    expect((await get()).status).toBe(401);
    expect((await get({ Authorization: "Bearer nope" })).status).toBe(401);
  });

  it("returns the metrics with the token", async () => {
    const res = await get({ Authorization: `Bearer ${TOKEN}` });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { metrics: { mrr: number; payingOrgs: number }; at_risk: unknown[] };
    const m = await businessMetrics(getDirectSql());
    expect(body.metrics.mrr).toBe(m.mrr);
    expect(body.metrics.payingOrgs).toBe(m.payingOrgs);
    expect(Array.isArray(body.at_risk)).toBe(true);
    const csv = await import("../app/api/admin/metrics/[file]/route");
    const r = await csv.GET(new Request("http://localhost/api/admin/metrics/at-risk.csv", { headers: { Authorization: `Bearer ${TOKEN}` } }), { params: Promise.resolve({ file: "at-risk.csv" }) });
    expect(r.status).toBe(200);
    expect((await r.text()).split("\r\n")[0]).toBe("org_id,org,plan,billing_state,last_activity,reason,owner_email");
  });
});
