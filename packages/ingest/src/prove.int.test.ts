// M11 "prove it" against the seeded DB: attribution of a later permit at a touched home (spec
// acceptance), ROI metrics + proof rows + PDF, learned weights after 10 outcomes, the fix list.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAll, getDirectSql } from "@216leads/db";
import { answersSchema, getTemplate } from "@216leads/scoring";
import { attributeOrg } from "./attribution";
import { createOrgFromWizard } from "./profile";
import { learnOrg, learnedFor, nudgedRecipe, resetLearned } from "./learned";
import { activeRecipe } from "./recipes";
import { monthlySeries, proofRows, roiMetrics } from "./roi";
import { roiPdf } from "./roi-pdf";
import { fixList } from "./fixlist";

const sql = getDirectSql();
const orgs: string[] = [];
let userId = "";
let orgId = "";
let permit: { parcel_key: string; event_date: string; zip: string; id: number; business: boolean; contractor_id: number | null };
let leadId = "";

beforeAll(async () => {
  userId = crypto.randomUUID();
  await sql`insert into auth.users (id, email) values (${userId}, ${`prove-${userId}@int.test`})`;
  [permit] = await sql`
    select e.parcel_key, e.event_date::text, p.zip, e.id, coalesce(not c.is_individual, false) as business, e.contractor_id
    from parcel_event e join parcel p on p.parcel_key = e.parcel_key left join contractor c on c.id = e.contractor_id
    where e.kind = 'permit' and e.category = 'roofing' and is_residential(p.land_use_code, p.data_limited)
    order by (c.id is not null and not c.is_individual) desc, e.event_date desc limit 1`;
  const answers = answersSchema.parse({ business_name: "Proof Roofing", sells: "Roofing", job_value: "2k_10k", zips: [permit.zip], preset: "roofing" });
  orgId = await createOrgFromWizard(sql, { userId, email: `prove-${userId}@int.test`, answers, recipe: { ...getTemplate("roofing"), preset_base: "roofing" } });
  orgs.push(orgId);
  // The home was touched (contacted) 30 days before the permit.
  await sql`delete from lead where org_id = ${orgId} and parcel_key = ${permit.parcel_key}`;
  [{ id: leadId }] = await sql`
    insert into lead (org_id, parcel_key, score, reasons, status, first_touch_at, first_surfaced_at)
    values (${orgId}, ${permit.parcel_key}, 80, '[]'::jsonb, 'contacted', (${permit.event_date}::date - 30)::timestamptz + interval '15 hours',
      (${permit.event_date}::date - 40)::timestamptz)
    returning id`;
});

afterAll(async () => {
  if (orgs.length) await sql`delete from org where id = any(${orgs}::uuid[])`;
  await sql`delete from auth.users where id = ${userId}`;
  await closeAll();
});

describe("attribution", () => {
  it("links a later permit at a touched home to a competitor, then to the org once marked won", async () => {
    const first = await attributeOrg(sql, orgId);
    expect(first.inserted).toBeGreaterThan(0);
    const [a] = await sql<{ outcome: string; competitor_id: number | null; days_to_event: number }[]>`
      select outcome, competitor_id, days_to_event from attribution where lead_id = ${leadId} and parcel_event_id = ${permit.id}`;
    expect(a!.outcome).toBe(permit.business ? "lost_competitor" : "unknown");
    expect(a!.days_to_event).toBe(30);
    if (permit.business) expect(Number(a!.competitor_id)).toBe(Number(permit.contractor_id));
    const act = await sql`select 1 from lead_activity where lead_id = ${leadId} and kind = 'attribution'`;
    expect(act.length).toBeGreaterThan(0);

    await sql`update lead set status = 'won', won_amount = 12000 where id = ${leadId}`;
    await sql`insert into lead_activity (org_id, lead_id, kind, data) values (${orgId}, ${leadId}, 'status_change', ${sql.json({ from: "contacted", to: "won" })})`;
    await attributeOrg(sql, orgId);
    const [b] = await sql<{ outcome: string; competitor_id: number | null }[]>`
      select outcome, competitor_id from attribution where lead_id = ${leadId} and parcel_event_id = ${permit.id}`;
    expect(b).toEqual({ outcome: "won_self", competitor_id: null });
    expect((await attributeOrg(sql, orgId)).updated).toBe(0); // idempotent
  });
});

describe("ROI", () => {
  it("counts the won job and its revenue, lists the proof row and renders a PDF", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const m = await roiMetrics(sql, orgId, "2000-01-01", today);
    expect(m.won).toBe(1);
    expect(m.revenue).toBe(12000);
    expect(m.roi).toBeNull(); // trial: no cost yet
    const proof = await proofRows(sql, orgId, "2000-01-01", today);
    expect(proof.find((p) => p.lead_id === leadId)?.outcome).toBe("won_self");
    const series = await monthlySeries(sql, orgId);
    expect(series).toHaveLength(12);
    expect(series.at(-1)!.won).toBe(1);
    const pdf = await roiPdf({ orgName: "Proof Roofing", month: today.slice(0, 7), metrics: m, series, proof });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
  });
});

describe("learned weights (spec 7.6)", () => {
  it("nudges weights once 10 outcomes exist as a feedback recipe version (A6), and Reset goes back", async () => {
    const before = await activeRecipe(sql, orgId);
    // Twelve homes in the area with outcomes: the six oldest won, the six newest lost, so age differs.
    const pick = (dir: "asc" | "desc") => sql<{ parcel_key: string }[]>`
      select parcel_key from parcel where zip = ${permit.zip} and is_residential(land_use_code, data_limited)
        and parcel_key <> ${permit.parcel_key} and year_built is not null
      order by year_built ${dir === "asc" ? sql`asc` : sql`desc`}, parcel_key limit 6`;
    const won = await pick("asc");
    const lost = await pick("desc");
    expect(won.length + lost.length).toBe(12);
    const keys = [...won, ...lost].map((h) => h.parcel_key);
    await sql`delete from lead where org_id = ${orgId} and parcel_key = any(${keys})`;
    await sql`insert into lead (org_id, parcel_key, score, reasons, status)
      select ${orgId}, k, 60, '[]'::jsonb, (case when n <= 6 then 'won' else 'lost' end)::lead_status
      from unnest(${keys}::text[]) with ordinality as x(k, n)`;
    const r = await learnOrg(sql, orgId);
    expect(r.outcomes).toBe(13);
    expect(Object.keys(r.meta).length).toBeGreaterThan(0);
    for (const f of Object.values(r.weights)) {
      expect(f).toBeGreaterThanOrEqual(0.8);
      expect(f).toBeLessThanOrEqual(1.25);
    }
    expect((await learnedFor(sql, orgId)).learned_meta).toEqual(r.meta);
    expect((await learnedFor(sql, orgId)).learned_weights).toEqual({}); // baked into the recipe instead
    const after = await activeRecipe(sql, orgId);
    expect(Object.keys(r.weights).length).toBeGreaterThan(0);
    {
      expect(after!.source).toBe("feedback");
      expect(after!.parent_id).toBe(before!.id);
      expect(after!.recipe.signals).toEqual(nudgedRecipe(before!.recipe, r.weights).signals);
      // Running again with the same outcomes doesn't stack another nudge.
      await learnOrg(sql, orgId);
      expect((await activeRecipe(sql, orgId))!.id).toBe(after!.id);
    }
    await resetLearned(sql, orgId);
    expect((await activeRecipe(sql, orgId))!.id).toBe(before!.id);
    expect((await learnOrg(sql, orgId)).outcomes).toBe(0);
    expect((await learnedFor(sql, orgId)).learned_weights).toEqual({});
  });
});

describe("fix list", () => {
  it("lists only open violations in the trade's category inside the area", async () => {
    const { category, rows } = await fixList(sql, orgId, "roofing");
    expect(category).toBe("roofing");
    const expected = await sql<{ n: number }[]>`
      select count(*)::int as n from parcel_event e join parcel p on p.parcel_key = e.parcel_key
      where e.kind = 'violation' and e.is_active and e.category = 'roofing' and p.zip = ${permit.zip}
        and is_residential(p.land_use_code, p.data_limited) and not exists (select 1 from suppression s where s.addr_norm = p.addr_norm)`;
    expect(rows.length).toBe(Math.min(expected[0]!.n, 500));
    expect((await fixList(sql, orgId, "new_movers")).rows).toEqual([]);
  });
});
