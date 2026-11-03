// Every in-app link must point at a real page or route (issue #70: the marketing site linked to
// /coverage, which did not exist). Reads the app/ tree as the route table and checks each static
// href in app/ and components/; `${...}` parts match any [param] segment.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const ANY = "\u0000";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.name === "node_modules" || e.name.startsWith(".") ? [] : e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** Route patterns as segment lists: route groups dropped, [param] and [...param] become wildcards. */
const routes = walk(join(WEB, "app"))
  .filter((f) => /[\\/](page\.tsx|route\.ts)$/.test(f))
  .map((f) =>
    relative(join(WEB, "app"), f).split(sep).slice(0, -1)
      .filter((s) => !/^\(.*\)$/.test(s))
      .map((s) => (s.startsWith("[...") ? "**" : s.startsWith("[") ? "*" : s)),
  );

function routeExists(path: string): boolean {
  const segs = path.split("/").filter(Boolean);
  return routes.some((r) => {
    if (r.at(-1) === "**") return segs.length >= r.length && r.slice(0, -1).every((s, i) => s === "*" || s === segs[i]);
    return r.length === segs.length && r.every((s, i) => s === "*" || s === segs[i]);
  });
}

/** Static app paths linked from .tsx files: href="/x", href={`/x/${id}`}, { href: "/x" } and ["Label", "/x"] link lists. */
function links(): { file: string; path: string }[] {
  const out: { file: string; path: string }[] = [];
  const patterns = [/href[=:]\s*(?:\{\s*)?["`](\/[^"`]*)["`]/g, /\[\s*"[^"]+",\s*"(\/[^"]*)"\s*\]/g];
  for (const f of [...walk(join(WEB, "app")), ...walk(join(WEB, "components"))].filter((f) => f.endsWith(".tsx"))) {
    const src = readFileSync(f, "utf8");
    for (const re of patterns) {
      for (const m of src.matchAll(re)) {
        const path = m[1]!.replace(/\$\{[^}]*\}/g, ANY).split(/[?#]/)[0]!;
        if (!path.startsWith("//")) out.push({ file: relative(WEB, f), path: path.replace(/\/$/, "") || "/" });
      }
    }
  }
  return out;
}

describe("in-app links", () => {
  const found = links();

  it("finds the marketing links (sanity check on the scan)", () => {
    const paths = new Set(found.map((l) => l.path));
    for (const p of ["/pricing", "/sample", "/coverage", "/signup", "/terms", "/optout", "/settings/coverage"]) expect(paths).toContain(p);
  });

  it("all point at an existing page or route", () => {
    const broken = found.filter((l) => !routeExists(l.path)).map((l) => `${l.file}: ${l.path.replaceAll(ANY, "${...}")}`);
    expect(broken).toEqual([]);
  });
});
