import { afterEach, describe, expect, it, vi } from "vitest";
import { closeAll, getDirectSql, getSql, make } from "./client";

// postgres.js connects lazily, so these only parse the URL; no database is needed.
type Parsed = { options: { user: string; pass: string; host: string[]; port: number[]; prepare: boolean } };
const parsed = (sql: unknown) => (sql as Parsed).options;

const POOLER = "aws-0-us-east-2.pooler.supabase.com";
const url = (password: string, port = 6543) =>
  `postgresql://postgres.abcdefghijklmnop:${password}@${POOLER}:${port}/postgres`;

describe("make: URL password decoding", () => {
  const symbolPasswords = ["p@ss:w/rd", "a#b?c&d=e", "100%sure", "x$y!z*()", "sp ace+plus", "q'uo\"te`", "[br]{ace}^|~<>,;"];

  it.each(symbolPasswords)("decodes a percent-encoded password with symbols: %s", (password) => {
    const o = parsed(make(url(encodeURIComponent(password)), { envName: "DATABASE_URL", max: 1, prepare: false }));
    expect(o.pass).toBe(password);
    expect(o.user).toBe("postgres.abcdefghijklmnop");
    expect(o.host).toEqual([POOLER]);
    expect(o.port).toEqual([6543]);
  });

  it("leaves an alphanumeric password unchanged", () => {
    expect(parsed(make(url("Abc123xyz"), { envName: "DATABASE_URL", max: 1, prepare: false })).pass).toBe("Abc123xyz");
  });

  it.each(["ab#cd", "ab/cd", "100%sure"])("rejects an unencoded %s without echoing the password", (password) => {
    const attempt = () => make(url(password), { envName: "DATABASE_URL", max: 1, prepare: false });
    expect(attempt).toThrow(/DATABASE_URL is not a valid connection URL/);
    expect(attempt).not.toThrow(password);
  });

  // The staging failures: these parse without error but send a different password.
  it("decodes only once, so a double-encoded password arrives still encoded, with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const o = parsed(make(url(encodeURIComponent(encodeURIComponent("p@ss"))), { envName: "DATABASE_URL", max: 1, prepare: false }));
    expect(o.pass).toBe("p%40ss");
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/DATABASE_URL: .*encoded twice/));
    expect(warn.mock.calls.flat().join(" ")).not.toContain("p%40ss");
    warn.mockRestore();
  });

  it("decodes %XX inside an unencoded password", () => {
    expect(parsed(make(url("ab%41cd"), { envName: "DATABASE_URL", max: 1, prepare: false })).pass).toBe("abAcd");
  });
});

describe("prepared statements", () => {
  const saved = { url: process.env.DATABASE_URL, direct: process.env.DATABASE_URL_DIRECT };

  afterEach(async () => {
    await closeAll();
    process.env.DATABASE_URL = saved.url;
    process.env.DATABASE_URL_DIRECT = saved.direct;
    if (saved.url === undefined) delete process.env.DATABASE_URL;
    if (saved.direct === undefined) delete process.env.DATABASE_URL_DIRECT;
  });

  it("are off for DATABASE_URL (transaction pooler) and on for DATABASE_URL_DIRECT (session pooler)", () => {
    process.env.DATABASE_URL = url("pw", 6543);
    process.env.DATABASE_URL_DIRECT = url("pw", 5432);
    expect(parsed(getSql()).prepare).toBe(false);
    expect(parsed(getDirectSql()).prepare).toBe(true);
    expect(parsed(getDirectSql()).port).toEqual([5432]);
  });

  it("stay off when the direct client falls back to DATABASE_URL", () => {
    process.env.DATABASE_URL = url("pw", 6543);
    process.env.DATABASE_URL_DIRECT = "";
    const o = parsed(getDirectSql());
    expect(o.prepare).toBe(false);
    expect(o.port).toEqual([6543]);
  });
});
