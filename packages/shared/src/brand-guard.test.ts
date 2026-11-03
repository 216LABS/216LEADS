// Issue #1 (and #42): no old product names in code. Fails if "hometrigger" or the pre-rename
// "216 Leads" shows up anywhere under apps/ or packages/ (spec docs live at the repo root and are
// excluded; applied migrations keep their comments because migrations are append-only).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", ".turbo", "playwright-report", "test-results", "migrations"]);
const TEXT = /\.(ts|tsx|js|mjs|json|md|mdx|yaml|yml|css|html|sql|txt)$/;
// Built from parts so this file doesn't match itself.
const BANNED = [new RegExp(["home", "trigger"].join(""), "i"), new RegExp(["216", "leads"].join(" ?"), "i")];
// The package scope (@216leads/*), internal ids and the local QA logins (*@216leads.test) are allowed (#42).
const ALLOWED = /@216leads\/|216leads\.test|__216leads|216leads-local|216leads:map|216leads-dev/gi;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (TEXT.test(name)) yield p;
  }
}

describe("old product names (issues #1, #42)", () => {
  it("appear nowhere under apps/ or packages/", () => {
    const hits: string[] = [];
    for (const top of ["apps", "packages"]) {
      for (const f of files(join(root, top))) {
        if (f === fileURLToPath(import.meta.url)) continue; // this file names what it looks for
        const text = readFileSync(f, "utf8").replace(ALLOWED, "");
        text.split("\n").forEach((line, i) => {
          if (BANNED.some((re) => re.test(line))) hits.push(`${relative(root, f)}:${i + 1}: ${line.trim().slice(0, 100)}`);
        });
      }
    }
    expect(hits).toEqual([]);
  });
});
