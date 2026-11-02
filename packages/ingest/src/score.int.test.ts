// Spec 7.7 scope lookup: loadHomes turns an org's territories into indexed parcel filters.
// It must pick exactly the homes org_territory_parcels() does, for every territory kind.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAll, getDirectSql } from "@216leads/db";
import { loadHomes } from "./score";

const sql = getDirectSql();
let orgId = "";

beforeAll(async () => {
  orgId = (await sql<{ id: string }[]>`insert into org (name, trade) values ('Scope Test', 'roofing') returning id`)[0]!.id;
  const [z] = await sql<{ zip: string }[]>`
    select zip from parcel where is_residential(land_use_code, data_limited) group by zip order by count(*) desc limit 1`;
  const [m] = await sql<{ municipality_id: number }[]>`
    select municipality_id from parcel where municipality_id is not null and zip <> ${z!.zip}
      and is_residential(land_use_code, data_limited) group by municipality_id order by count(*) desc limit 1`;
  await sql`insert into territory (org_id, kind, zip) values (${orgId}, 'zip', ${z!.zip})`;
  if (m) await sql`insert into territory (org_id, kind, municipality_id) values (${orgId}, 'municipality', ${m.municipality_id})`;
  // A small polygon around one home outside both.
  await sql`
    insert into territory (org_id, kind, geom)
    select ${orgId}, 'polygon', st_multi(st_buffer(geom, 0.003))::geometry(MultiPolygon, 4326)
    from parcel where geom is not null and zip <> ${z!.zip} and municipality_id is distinct from ${m?.municipality_id ?? null}
      and is_residential(land_use_code, data_limited)
    order by parcel_key limit 1`;
});

afterAll(async () => {
  if (orgId) await sql`delete from org where id = ${orgId}`;
  await closeAll();
});

describe("org scope (spec 7.7)", () => {
  it("loads the same homes as org_territory_parcels for zip, municipality and polygon territories", async () => {
    const homes = await loadHomes(sql, { orgId });
    const expected = await sql<{ parcel_key: string }[]>`
      select parcel_key from parcel p
      where is_residential(p.land_use_code, p.data_limited) and p.parcel_key in (select org_territory_parcels(${orgId}))`;
    expect(homes.length).toBeGreaterThan(0);
    expect(homes.map((h) => h.input.parcel.parcel_key).sort()).toEqual(expected.map((r) => r.parcel_key).sort());
  });
});
