// Settings (spec 9.7, 13): ZIP territories, team invites and data coverage against the seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeAll, getDirectSql } from "@216leads/db";
import { acceptInvite, createInvite, listTeam, orgZips, setZipTerritories, territoryCoverage } from "./settings";

const sql = getDirectSql();
const users = Array.from({ length: 3 }, () => crypto.randomUUID());
const email = (i: number) => `set-${users[i]}@int.test`;
let orgA = "";
let orgB = "";

beforeAll(async () => {
  for (let i = 0; i < users.length; i++) await sql`insert into auth.users (id, email) values (${users[i]!}, ${email(i)})`;
  orgA = (await sql<{ id: string }[]>`insert into org (name, trade) values ('Settings A', 'roofing') returning id`)[0]!.id;
  orgB = (await sql<{ id: string }[]>`insert into org (name, trade) values ('Settings B', 'roofing') returning id`)[0]!.id;
  await sql`insert into org_member (org_id, user_id, role) values (${orgA}, ${users[0]!}, 'owner'), (${orgB}, ${users[2]!}, 'owner')`;
});

afterAll(async () => {
  await sql`delete from org where id in (${orgA}, ${orgB})`;
  await sql`delete from auth.users where id = any(${users}::uuid[])`;
  await closeAll();
});

describe("settings", () => {
  it("replaces ZIP territories, dropping bad and duplicate ZIPs", async () => {
    expect(await setZipTerritories(sql, orgA, ["44107", "44111", "44107", "abc"])).toEqual(["44107", "44111"]);
    expect(await setZipTerritories(sql, orgA, ["44111", "44102"])).toEqual(["44111", "44102"]);
    expect(await orgZips(sql, orgA)).toEqual(["44102", "44111"]);
  });

  it("invites by email; only that address can accept, once, into one org", async () => {
    const inv = await createInvite(sql, orgA, email(1).toUpperCase());
    expect((await acceptInvite(sql, "nope", { id: users[1]!, email: email(1) })).result).toBe("invalid");
    expect((await acceptInvite(sql, inv.token, { id: users[2]!, email: email(2) })).result).toBe("wrong_email");
    expect((await acceptInvite(sql, inv.token, { id: users[1]!, email: email(1) })).result).toBe("joined");
    // Reopening the used link (the page loads twice after sign-up) is not an error for the person who joined.
    expect((await acceptInvite(sql, inv.token, { id: users[1]!, email: email(1) })).result).toBe("already_member");
    expect((await acceptInvite(sql, inv.token, { id: users[2]!, email: email(2) })).result).toBe("invalid"); // used up
    const team = await listTeam(sql, orgA);
    expect(team.members.map((m) => m.role).sort()).toEqual(["member", "owner"]);
    expect(team.invites).toEqual([]);

    // Someone already in another org can't join a second one.
    const other = await createInvite(sql, orgA, email(2));
    expect((await acceptInvite(sql, other.token, { id: users[2]!, email: email(2) })).result).toBe("has_other_org");
  });

  it("reports coverage per town in the territory", async () => {
    await setZipTerritories(sql, orgA, ["44107", "44111"]);
    const { towns, sources } = await territoryCoverage(sql, orgA);
    expect(towns.length).toBeGreaterThan(0);
    expect(towns.every((t) => t.homes > 0)).toBe(true);
    expect(Array.isArray(sources)).toBe(true);
  });
});
