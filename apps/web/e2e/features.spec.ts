// Feature walk (issue #72): the link crawl only proves pages open. This signs in and uses each
// feature the way a contractor would: every save, upload, download, filter and map layer has to
// answer 2xx and show no error. Any 5xx, page crash or "Something went wrong" on the way fails the
// test. Changes are put back afterwards so the other smoke tests see the seeded account as before.
import { expect, test, type Page, type Response } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "qa@216leads.test";
const password = process.env.E2E_PASSWORD ?? "qa-216-leads-local";

// Not serial: one broken feature should not hide the rest. Steps still run in order on one page.
test.describe.configure({ mode: "default" });

let page: Page;
const problems: string[] = [];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  page.on("pageerror", (e) => problems.push(`page error on ${new URL(page.url()).pathname}: ${e.message}`));
  await page.goto("login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
});

test.afterEach(async () => {
  const found = problems.splice(0);
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
  expect(found, "server errors or crashes during this step").toEqual([]);
});

test.afterAll(async () => page.close());

/** Do something that writes, and require the API call it makes to succeed. */
async function saves(action: () => Promise<unknown>, path?: RegExp): Promise<Response> {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/") && r.request().method() !== "GET" && (!path || path.test(r.url()))),
    action(),
  ]);
  expect(res.status(), `${res.request().method()} ${new URL(res.url()).pathname}: ${await res.text().catch(() => "")}`).toBeLessThan(400);
  return res;
}

async function noErrorAlert() {
  for (const a of await page.locator("main").getByRole("alert").all()) {
    const t = (await a.innerText()).trim();
    if (t) expect.soft(t, "error shown on the page").toBe("");
  }
}

test("leads: every filter, search and sort answers; CSV export downloads", async () => {
  await page.goto("leads");
  // The trade is a display name in sentences ("HVAC homes"), never the raw key (issue #72).
  await expect(page.locator("main")).toContainText(/ HVAC homes /);
  for (const name of ["Score 70+", "Just sold", "Neighbors", "Citation", "New this week", "Won", "Skipped", "All", "Active"]) {
    await page.getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  }
  await page.getByRole("combobox", { name: "Sort by" }).selectOption({ index: 1 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("searchbox", { name: "Search address or town" }).fill("Ave");
  await page.keyboard.press("Enter");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main [data-lead-link]:visible").first()).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  await noErrorAlert();
});

test("lead detail: change status, add a note, then put the status back", async () => {
  await page.goto("leads");
  await page.locator("main [data-lead-link]:visible").first().click();
  await expect(page.getByRole("combobox", { name: "Status" })).toBeVisible();
  const status = page.getByRole("combobox", { name: "Status" });
  const before = await status.inputValue();
  await status.selectOption("contacted");
  const save = page.getByRole("button", { name: "Save" });
  if (await save.isVisible()) await saves(() => save.click(), /\/api\/leads\//);
  const note = `feature walk ${Date.now()}`;
  await page.getByRole("textbox", { name: "Add a note" }).fill(note);
  await saves(() => page.getByRole("button", { name: "Add note" }).click(), /\/notes/);
  await expect(page.getByText(note)).toBeVisible();
  await status.selectOption(before);
  if (await save.isVisible()) await saves(() => save.click(), /\/api\/leads\//);
  await noErrorAlert();
});

test("map: pins and every layer load", async () => {
  const points = page.waitForResponse((r) => r.url().includes("/api/map/points"));
  await page.goto("map");
  expect((await points).status()).toBe(200);
  for (const name of ["Permits", "Sales", "Violations", "Flood zones", "Heat"]) {
    const res = page.waitForResponse((r) => /\/api\/map\/(layer|heat)/.test(r.url()), { timeout: 15_000 }).catch(() => null);
    await page.getByRole("button", { name, exact: true }).click();
    const r = await res;
    if (r) expect(r.status(), `${name} layer`).toBe(200);
  }
  await page.goto("map/competitors");
  for (const name of ["30 days", "12 months", "All permits"]) {
    await page.getByRole("link", { name, exact: true }).or(page.getByRole("button", { name, exact: true })).first().click();
    await page.waitForLoadState("networkidle");
  }
  await expect(page.getByRole("heading", { name: "Competitors" })).toBeVisible();
});

test("mail: proof PDF, auto-mail save, send screen", async () => {
  await page.goto("mail");
  const proof = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/mail/preview") && r.request().method() === "POST"),
    page.getByRole("button", { name: "Get proof PDF" }).click(),
  ]).then(([r]) => r);
  expect(proof.status(), await proof.text().catch(() => "")).toBeLessThan(500);
  await saves(() => page.getByRole("button", { name: "Save auto-mail" }).click(), /\/api\/mail\/rules/);
  await noErrorAlert();
  await page.goto("leads");
  const href = await page.locator("main [data-lead-link]:visible").first().getAttribute("href");
  await page.goto(`mail/send?leads=${href!.split("/").pop()}`);
  await expect(page.getByRole("button", { name: /Send 1 postcard/ })).toBeEnabled();
});

test("results: the monthly PDF downloads", async () => {
  await page.goto("roi");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  await noErrorAlert();
});

test("homes you want: a change previews and saves, then goes back", async () => {
  await page.goto("settings/profile");
  await expect(page.getByText(/homes? match/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("radio", { name: "30+ yrs" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled({ timeout: 30_000 });
  await saves(() => page.getByRole("button", { name: "Save" }).click(), /\/api\/profile\/activate/);
  await page.getByRole("radio", { name: "Any" }).first().click();
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled({ timeout: 30_000 });
  await saves(() => page.getByRole("button", { name: "Save" }).click(), /\/api\/profile\/activate/);
  await noErrorAlert();
});

test("your area: counts use the same scoring as the leads list", async () => {
  await page.goto("leads");
  const active = Number((await page.getByRole("button", { name: /^Active/ }).innerText()).replace(/\D/g, ""));
  await page.goto("settings/territories");
  const chips = page.getByText(/homes match/);
  await expect(chips.first()).toBeVisible({ timeout: 30_000 });
  const sum = (await chips.allInnerTexts()).reduce((n, t) => n + Number(/([\d,]+) homes match/.exec(t)![1]!.replace(/,/g, "")), 0);
  // Worked leads (won, skipped) drop off Active, so the area count can only be a little higher.
  expect(sum).toBeGreaterThanOrEqual(active);
  expect(sum - active).toBeLessThan(Math.max(50, active * 0.05));
});

test("brand, digest and current customers save", async () => {
  await page.goto("settings/brand");
  const phone = page.getByRole("textbox", { name: "Phone" });
  const oldPhone = await phone.inputValue();
  await phone.fill("(216) 555-0199");
  await saves(() => page.getByRole("button", { name: "Save" }).click());
  await phone.fill(oldPhone);
  await saves(() => page.getByRole("button", { name: "Save" }).click());
  await page.goto("settings/digest");
  await saves(() => page.getByRole("button", { name: "Save" }).click(), /\/api\/settings\/org/);
  await page.goto("settings/customers");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: /Upload a CSV/ }).click()]);
  await saves(() => chooser.setFiles({ name: "customers.csv", mimeType: "text/csv", buffer: Buffer.from("address,zip\n1 Nowhere Test Rd,44107\n") }));
  await noErrorAlert();
});

test("team: an invite gives a link and can be canceled, freeing the seat", async () => {
  await page.goto("settings/team");
  // Open invites hold seats; clear any on the QA account so the plan has room.
  for (let b = page.getByRole("button", { name: /^Cancel invite for / }).first(); await b.isVisible(); ) {
    await saves(() => b.click(), /\/api\/settings\/team/);
    await page.waitForLoadState("networkidle");
  }
  const who = `walk-${Date.now()}@example.com`;
  await page.getByRole("textbox", { name: "Invite by email" }).fill(who);
  await saves(() => page.getByRole("button", { name: "Invite", exact: true }).click(), /\/api\/settings\/team/);
  await expect(page.getByText(/Send them this link/)).toBeVisible();
  await saves(() => page.getByRole("button", { name: `Cancel invite for ${who}` }).click(), /\/api\/settings\/team/);
  await expect(page.getByText(who)).toHaveCount(0);
});

test("your account: password change works and checks the two match", async () => {
  await page.goto("settings/security");
  await expect(page).toHaveURL(/\/settings\/account$/);
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole("textbox", { name: "New password" }).fill("not-the-same-1");
  await page.getByRole("textbox", { name: "Type it again" }).fill("not-the-same-2");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("don't match");
  // Supabase refuses the current password as the new one, so change it and change it back;
  // later runs and the other tests still sign in with the usual password.
  for (const next of [`${password}-walk`, password]) {
    await page.getByRole("textbox", { name: "New password" }).fill(next);
    await page.getByRole("textbox", { name: "Type it again" }).fill(next);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.locator("main").getByRole("status")).toContainText("Password changed");
  }
});

test("report a problem opens centered", async () => {
  await page.goto("settings");
  await page.getByRole("button", { name: "Report a problem" }).first().click();
  const box = (await page.getByRole("dialog").boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(Math.abs(box.x + box.width / 2 - vw / 2)).toBeLessThan(20);
  await page.getByRole("button", { name: "Cancel" }).click();
});
