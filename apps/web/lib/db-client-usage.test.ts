import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const web = join(__dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name.startsWith(".")) return [];
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe("database client in the web app (issue #72)", () => {
  // getDirectSql is the session pooler (5432, 15 clients for the whole project). Serverless
  // instances each holding a few of those ran out and pages answered 500 with EMAXCONNSESSION.
  // Request code uses getSql (transaction pooler); getDirectSql is for migrations and ingest.
  it("never uses the session-pooler client", () => {
    const offenders = ["app", "lib", "components"]
      .flatMap((d) => sources(join(web, d)))
      .concat(join(web, "middleware.ts"))
      .filter((f) => readFileSync(f, "utf8").includes("getDirectSql"))
      .map((f) => relative(web, f));
    expect(offenders).toEqual([]);
  });
});
