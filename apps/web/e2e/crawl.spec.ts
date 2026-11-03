// Link crawl (issue #70): follow every internal link, signed out from the home page and signed in
// as the QA user from the leads list, and fail on any page or file that answers 404, 410 or 5xx.
// Other 4xx are answers, not broken links (the CSV export answers 429 once the daily cap is used).
// One visit per path; dynamic routes (ids, tokens, ZIPs) are visited at most twice each.
import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "qa@216leads.test";
const password = process.env.E2E_PASSWORD ?? "qa-216-leads-local";
const MAX_PAGES = 120;
// Links that change something when opened: signing out, accepting an invite, unsubscribing.
const SKIP = [/\/auth\//, /\/invite\//, /\/api\/public\/unsubscribe/];

/** /leads/3f2a... and /sample/hvac/44107 count as one route each, so a long list doesn't eat the budget. */
const pattern = (path: string) => path.split("/").map((s) => (/^[0-9a-f-]{16,}$/i.test(s) || /^\d+$/.test(s) || s.includes(":") ? ":id" : s)).join("/");

async function crawl(page: Page, start: string, baseURL: string) {
  const base = new URL(baseURL);
  const root = base.pathname.replace(/\/$/, "");
  const queue: { href: string; from: string }[] = [{ href: new URL(start, base).href, from: "start" }];
  const seen = new Set<string>();
  const perPattern = new Map<string, number>();
  const broken: string[] = [];
  const pages: string[] = [];
  let visited = 0;
  while (queue.length && visited < MAX_PAGES) {
    const { href, from } = queue.shift()!;
    const url = new URL(href);
    if (seen.has(url.pathname)) continue;
    seen.add(url.pathname);
    const p = pattern(url.pathname);
    if ((perPattern.get(p) ?? 0) >= 2) continue;
    perPattern.set(p, (perPattern.get(p) ?? 0) + 1);
    visited++;
    pages.push(url.pathname.slice(root.length) || "/");
    // Downloads (CSV, PDF) don't render a document, so goto throws; check those with a request.
    const res = await page.goto(url.href, { waitUntil: "domcontentloaded" }).catch(() => null);
    const status = res ? res.status() : (await page.request.get(url.href)).status();
    if (status === 404 || status === 410 || status >= 500) {
      broken.push(`${status} ${url.pathname}${url.search} (linked from ${from})`);
      continue;
    }
    if (status >= 400 || !res || !(res.headers()["content-type"] ?? "").includes("text/html")) continue;
    const here = new URL(page.url()).pathname;
    for (const h of await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href))) {
      const u = new URL(h);
      if (u.origin !== base.origin || !(u.pathname === root || u.pathname.startsWith(`${root}/`)) || SKIP.some((re) => re.test(u.pathname))) continue;
      if (!seen.has(u.pathname)) queue.push({ href: u.href, from: here });
    }
  }
  // Listed in the report, so a crawl that silently stops early is easy to spot.
  test.info().annotations.push({ type: "crawled", description: `${visited} pages: ${pages.join(" ")}` });
  return { broken, visited };
}

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "one crawl is enough; the phone project runs the smoke flows");
});

test("signed out: every link from the public site answers", async ({ page, baseURL }) => {
  const { broken, visited } = await crawl(page, "./", baseURL!);
  expect(visited).toBeGreaterThan(5);
  expect(broken).toEqual([]);
});

test("signed in: every link in the app answers", async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  await page.goto("login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  const { broken, visited } = await crawl(page, "leads", baseURL!);
  expect(visited).toBeGreaterThan(10);
  expect(broken).toEqual([]);
});
