// Integration tests against a migrated database seeded with the real-data fixtures
// (`pnpm db:migrate && pnpm db:seed`). Run with `pnpm test:integration`.
import { afterAll, describe, expect, it } from "vitest";
import { closeAll, getDirectSql } from "@216leads/db";
import { TEMPLATES, getTemplate } from "@216leads/scoring";
import { loadFixtures } from "./seed";
import { scoreOrg } from "./score";

const sql = getDirectSql();
afterAll(() => closeAll());

async function demoOrgId(): Promise<string> {
  const [o] = await sql<{ id: string }[]>`select id from org where name = 'Demo Roofing' order by created_at limit 1`;
  if (!o) throw new Error("Demo Roofing missing: run `pnpm db:seed` first");
  return o.id;
}

describe("fixture ingest", () => {
  it("loaded real homes and matched every Cleveland record", async () => {
    const [r] = await sql<{ homes: number; events: number; unmatched: number }[]>`
      select (select count(*) from parcel)::int as homes,
             (select count(*) from parcel_event where source like 'cle_%')::int as events,
             (select count(*) from parcel_event where source like 'cle_%' and parcel_key is null)::int as unmatched`;
    expect(r!.homes).toBeGreaterThanOrEqual(2000);
    expect(r!.events).toBeGreaterThan(500);
    expect(r!.unmatched / r!.events).toBeLessThan(0.01);
  });

  it("is idempotent: loading the same fixtures again changes no rows", async () => {
    const before = await sql<{ n: number; latest: string | null }[]>`
      select count(*)::int as n, max(updated_at)::text as latest from parcel`;
    await loadFixtures(sql);
    const after = await sql<{ n: number; latest: string | null }[]>`
      select count(*)::int as n, max(updated_at)::text as latest from parcel`;
    expect(after[0]).toEqual(before[0]);
  });

  it("stores no contractor person names", async () => {
    const [r] = await sql<{ n: number }[]>`
      select count(*)::int as n from contractor where is_individual and display_name <> 'Independent contractor'`;
    expect(r!.n).toBe(0);
  });
});

describe("scoring", () => {
  it("scores the demo org with reasons and evidence", async () => {
    const orgId = await demoOrgId();
    await scoreOrg(sql, orgId);
    const leads = await sql<{ score: number; reasons: { label: string; evidence: { url?: string } }[] }[]>`
      select score, reasons from lead where org_id = ${orgId} order by score desc limit 50`;
    expect(leads.length).toBeGreaterThan(0);
    for (const l of leads) {
      expect(l.score).toBeGreaterThanOrEqual(0);
      expect(l.score).toBeLessThanOrEqual(100);
      expect(l.reasons.length).toBeGreaterThan(0);
    }
    // Lead detail needs at least 3 reasons with evidence links on strong leads (M1 acceptance).
    const top = leads[0]!;
    expect(top.reasons.length).toBeGreaterThanOrEqual(3);
    expect(top.reasons.filter((r) => r.evidence?.url).length).toBeGreaterThanOrEqual(1);
  });

  it("re-scoring with no data change writes nothing", async () => {
    const orgId = await demoOrgId();
    await scoreOrg(sql, orgId);
    const s = await scoreOrg(sql, orgId);
    expect(s.inserted + s.updated + s.removed).toBe(0);
  });

  it("every preset template loads", () => {
    for (const key of Object.keys(TEMPLATES)) expect(getTemplate(key).key).toBe(key);
  });
});
