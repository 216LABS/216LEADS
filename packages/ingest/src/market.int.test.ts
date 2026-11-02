// M9 acceptance (spec 15): neighbor ring and competitor tracker return correct counts against
// the fixtures. Every count is checked against an independent SQL count over the same rows.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAll, getDirectSql } from "@216leads/db";
import { scoreOrg } from "./score";
import { competitors, eventLayer, heatGrid, mapPoints, neighborRing, territoryExtent } from "./market";

const sql = getDirectSql();
let orgId = "";
let zip = "";
const DAYS = 730;

beforeAll(async () => {
  // The ZIP with the most matched permits in the fixtures.
  ({ zip } = (await sql<{ zip: string }[]>`
    select p.zip from parcel_event e join parcel p on p.parcel_key = e.parcel_key
    where e.kind = 'permit' and e.event_date >= current_date - ${DAYS}::int and is_residential(p.land_use_code, p.data_limited)
    group by p.zip order by count(*) desc limit 1`)[0]!);
  orgId = (await sql<{ id: string }[]>`
    insert into org (name, trade, onboarded_at, trial_ends_at, billing_state) values ('Market Test Roofing', 'roofing', now(), now() + interval '10 days', 'trialing')
    returning id`)[0]!.id;
  await sql`insert into territory (org_id, kind, zip) values (${orgId}, 'zip', ${zip})`;
  await scoreOrg(sql, orgId);
});

afterAll(async () => {
  if (orgId) await sql`delete from org where id = ${orgId}`;
  await closeAll();
});

describe("map points", () => {
  it("returns every visible lead with coordinates, and drops hidden ones", async () => {
    const { n } = (await sql<{ n: number }[]>`
      select count(*)::int as n from lead l join parcel p on p.parcel_key = l.parcel_key
      where l.org_id = ${orgId} and not l.hidden and p.geom is not null and l.status in ('new','contacted','quoted','won')`)[0]!;
    expect(n).toBeGreaterThan(0);
    const fc = await mapPoints(sql, orgId);
    expect(fc.features.length).toBe(Math.min(n, 5000));
    expect(fc.features.every((f) => (f.geometry as { coordinates: number[] }).coordinates.every(Number.isFinite))).toBe(true);
    const first = fc.features[0]!.properties;
    await sql`update lead set hidden = true where id = ${first.id}`;
    const after = await mapPoints(sql, orgId);
    expect(after.features.some((f) => f.properties.id === first.id)).toBe(false);
    await sql`update lead set hidden = false where id = ${first.id}`;
  });

  it("fits the area", async () => {
    const b = await territoryExtent(sql, orgId);
    expect(b).not.toBeNull();
    expect(b![0]).toBeLessThan(b![2]);
    expect(b![1]).toBeLessThan(b![3]);
  });
});

describe("neighbor ring", () => {
  it("counts the residential homes within 150 m in the area, nearest first", async () => {
    const [center] = await sql<{ parcel_key: string }[]>`
      select l.parcel_key from lead l where l.org_id = ${orgId} order by l.score desc limit 1`;
    const key = center!.parcel_key;
    const { n } = (await sql<{ n: number }[]>`
      select count(*)::int as n from parcel p, parcel c
      where c.parcel_key = ${key} and p.parcel_key <> c.parcel_key and p.zip = ${zip}
        and st_dwithin(p.geom::geography, c.geom::geography, 150) and is_residential(p.land_use_code, p.data_limited)`)[0]!;
    const ring = await neighborRing(sql, orgId, key, { radiusM: 150, limit: 100 });
    expect(ring).not.toBeNull();
    expect(ring!.counts.homes).toBe(Math.min(n, 100));
    const d = ring!.homes.map((h) => h.distance_m);
    expect(d).toEqual([...d].sort((a, b) => a - b));
    expect(d.every((x) => x <= 150)).toBe(true);
    const { leads } = (await sql<{ leads: number }[]>`
      select count(*)::int as leads from lead where org_id = ${orgId} and not hidden and parcel_key = any(${ring!.homes.map((h) => h.parcel_key)})`)[0]!;
    expect(ring!.counts.leads).toBe(leads);
    // The default ring is the 40 nearest.
    expect((await neighborRing(sql, orgId, key))!.counts.homes).toBe(Math.min(n, 40));
  });

  it("counts a recently mailed neighbor and refuses homes outside the area", async () => {
    const [center] = await sql<{ parcel_key: string }[]>`select parcel_key from lead where org_id = ${orgId} order by score desc limit 1`;
    const ring = await neighborRing(sql, orgId, center!.parcel_key);
    const h = ring!.homes[0]!;
    await sql`insert into mail_piece (org_id, parcel_key, provider, status, to_address) values (${orgId}, ${h.parcel_key}, 'dryrun', 'queued', '{}')`;
    const again = await neighborRing(sql, orgId, center!.parcel_key);
    expect(again!.counts.mailed_recently).toBe(ring!.counts.mailed_recently + 1);
    expect(again!.counts.mailable).toBe(ring!.counts.mailable - 1);
    const [outside] = await sql<{ parcel_key: string }[]>`select parcel_key from parcel where zip <> ${zip} and geom is not null limit 1`;
    expect(await neighborRing(sql, orgId, outside!.parcel_key)).toBeNull();
  });
});

describe("competitor tracker", () => {
  it("matches an independent count of permits in the area, by business", async () => {
    const rows = await sql<{ id: string; is_individual: boolean | null; n: number }[]>`
      select e.contractor_id::text as id, c.is_individual, count(*)::int as n
      from parcel_event e join parcel p on p.parcel_key = e.parcel_key left join contractor c on c.id = e.contractor_id
      where e.kind = 'permit' and e.event_date >= current_date - ${DAYS}::int and p.zip = ${zip}
      group by 1, 2`;
    const r = await competitors(sql, orgId, { days: DAYS, limit: 100 });
    expect(r.total_permits).toBe(rows.reduce((s, x) => s + x.n, 0));
    expect(r.total_permits).toBeGreaterThan(0);
    expect(r.independent_permits).toBe(rows.filter((x) => x.is_individual).reduce((s, x) => s + x.n, 0));
    const business = new Map(rows.filter((x) => x.id && x.is_individual === false).map((x) => [x.id, x.n]));
    expect(r.competitors.length).toBe(Math.min(business.size, 100));
    for (const c of r.competitors) {
      expect(c.count).toBe(business.get(c.contractor_id));
      expect(c.categories.reduce((s, k) => s + k.count, 0)).toBe(c.count);
      expect(c.recent.length).toBe(Math.min(c.count, 5));
    }
    const counts = r.competitors.map((c) => c.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("filters by category and never names individuals", async () => {
    const all = await competitors(sql, orgId, { days: DAYS, limit: 100 });
    const cat = all.competitors[0]?.categories[0]?.category;
    if (cat && cat !== "other") {
      const one = await competitors(sql, orgId, { days: DAYS, category: cat, limit: 100 });
      expect(one.competitors.every((c) => c.categories.every((k) => k.category === cat))).toBe(true);
      expect(one.total_permits).toBeLessThanOrEqual(all.total_permits);
    }
    const individuals = await sql<{ display_name: string }[]>`select display_name from contractor where is_individual`;
    const names = new Set(individuals.map((i) => i.display_name));
    expect(all.competitors.some((c) => names.has(c.name))).toBe(false);
    const layer = await eventLayer(sql, orgId, { kind: "permit", days: DAYS });
    expect(layer.features.some((f) => f.properties.business && names.has(f.properties.business))).toBe(false);
  });
});

describe("heat grid", () => {
  it("adds up to the permits in the area", async () => {
    const cells = await heatGrid(sql, orgId, { kind: "permit", days: DAYS });
    const { n } = (await sql<{ n: number }[]>`
      select count(*)::int as n from parcel_event e join parcel p on p.parcel_key = e.parcel_key
      where e.kind = 'permit' and e.event_date >= current_date - ${DAYS}::int and p.zip = ${zip} and p.geom is not null`)[0]!;
    expect(cells.reduce((s, c) => s + c.count, 0)).toBe(n);
  });
});
