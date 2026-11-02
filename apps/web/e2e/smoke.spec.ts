// Smoke test (DevOps addendum D2). Grows with the product: onboarding (A2/M4), CRM stage
// changes (M5) and a test-mode postcard (M8) are added by those milestones.
import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "qa@216leads.test";
const password = process.env.E2E_PASSWORD ?? "qa-216-leads-local";

async function signInQa(page: import("@playwright/test").Page) {
  await page.goto("login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
}

test("QA login sees scored leads", async ({ page }) => {
  await page.goto("login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/leads(\?|$)/);
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  // Not production: the environment banner is always shown.
  await expect(page.getByRole("note")).toContainText(/STAGING|LOCAL/);
  const firstLead = page.locator("main [data-lead-link]:visible").first();
  await expect(firstLead).toBeVisible();
  await expect(firstLead).toContainText(/\d/); // score chip and street number
});

test("a new user signs up, answers the wizard, confirms the recipe and lands on scored leads", async ({ page }) => {
  await page.goto("signup");
  await page.getByLabel("Work email").fill(`e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@216leads.test`);
  await page.getByLabel("Password").fill("e2e-password-216");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Addendum A2 wizard (CI has no LLM key, so this runs the closest-preset path).
  await page.getByLabel("Business name").fill("E2E Fence Co");
  await page.getByLabel("What do you sell, in a sentence?").fill("Wood and vinyl fence installation");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Describe your best customer from the last year.").fill("New homeowners with a dog and a big back yard");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Where do you work?").fill("44107 44111");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("list", { name: "Your ZIP codes" })).toContainText("44111");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pool", exact: true })).toHaveAttribute("aria-pressed", "true"); // A5 pre-tick
  await page.getByRole("button", { name: "Build my list" }).click();

  // Confirm screen (A4): live count and real sample homes from the scoring engine.
  await expect(page.getByRole("heading", { name: "Here’s your list" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "5 homes from your list" })).toBeVisible();
  await page.getByRole("button", { name: "Looks good, show my leads" }).click();

  // Spec 9.1 steps 4-5: brand, then plan; the trial needs no card.
  await expect(page).toHaveURL(/\/onboarding\/brand/, { timeout: 30_000 });
  await page.getByLabel("Phone").fill("(216) 555-0100");
  await page.getByLabel("Default offer").fill("$100 off a new fence");
  await expect(page.getByLabel("Postcard preview")).toContainText("$100 off a new fence");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/\/onboarding\/plan/);
  await page.getByRole("link", { name: "Start my free trial" }).click();
  await expect(page).toHaveURL(/\/leads(\?|$)/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  await expect(page.locator("main [data-lead-link]:visible").first()).toBeVisible();
});

test("the preset path: pick a trade, add a town, set the perfect customer, land on leads", async ({ page }) => {
  await page.goto("signup");
  await page.getByLabel("Work email").fill(`e2e-p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@216leads.test`);
  await page.getByLabel("Password").fill("e2e-password-216");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  await page.getByRole("button", { name: "Skip the questions and pick your trade" }).click();
  await page.getByLabel("Business name").fill("E2E Roofing");
  await page.getByRole("button", { name: "Roofing", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Town search adds the town's ZIP codes; chips show live counts.
  await page.getByLabel("Where do you work?").fill("Lakew");
  await page.getByRole("option").filter({ hasText: "Lakewood" }).click();
  await expect(page.getByRole("list", { name: "Your ZIP codes" })).toContainText("44107");
  await expect(page.getByRole("list", { name: "Your ZIP codes" })).toContainText("homes match", { timeout: 20_000 });
  await page.getByRole("button", { name: "Build my list" }).click();

  await expect(page.getByRole("heading", { name: "Your perfect customer" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("radio", { name: "Pre-1950" }).click();
  await expect(page.getByText("counting…")).toBeHidden({ timeout: 20_000 });
  await page.getByRole("button", { name: "Looks good, show my leads" }).click();
  await expect(page).toHaveURL(/\/onboarding\/brand/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("link", { name: "Start my free trial" }).click();
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible({ timeout: 30_000 });
});

test("report a problem sends", async ({ page }) => {
  await page.goto("login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  await page.getByRole("button", { name: /Report a problem|Help/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("What went wrong").fill("E2E smoke test report, please ignore.");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText("Thanks. We got it")).toBeVisible();
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("leads");
  await expect(page).toHaveURL(/\/login\?next=/);
});

test("CRM: filter, open a lead, add a note, mark it won, export CSV", async ({ page }, info) => {
  await signInQa(page);
  // Spec 9.2 filter chips live in the URL.
  await page.getByRole("button", { name: "Score 70+" }).click();
  await expect(page).toHaveURL(/chips=score70/);
  await page.getByRole("button", { name: "Score 70+" }).click();
  await expect(page).not.toHaveURL(/chips=score70/);

  // Phone and desktop run at the same time on the same QA org: each takes a different lead.
  const lead = page.locator("main [data-lead-link]:visible").nth(info.project.name === "phone" ? 0 : 1);
  await lead.click();
  await expect(page.getByRole("heading", { name: "Why this home" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Home facts" })).toBeVisible();

  const note = `Left a door hanger ${Date.now()}`;
  await page.getByLabel("Add a note").fill(note);
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText(note)).toBeVisible();

  // Spec 9.4 won flow asks the job amount.
  await page.getByLabel("Status").selectOption("won");
  await page.getByLabel("Job amount in dollars").fill("9800");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Marked won")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Status")).toHaveValue("won");

  // CSV export: addresses, scores and reasons, the disclaimer, never names.
  const res = await page.request.get("api/leads/export.csv?view=won");
  expect(res.status()).toBe(200);
  const csv = await res.text();
  expect(csv.split("\n")[0]).toBe("address,city,zip,score,trigger,reasons,status");
  expect(csv).toContain("Not a consumer report");
  expect(csv).toMatch(/,won\r?\n/);
});

test("billing page shows the plans and the trial, with billing off when Stripe isn't configured", async ({ page }) => {
  await signInQa(page);
  await page.goto("settings/billing");
  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  await expect(page.getByText("Free trial", { exact: true })).toBeVisible();
  for (const plan of ["Starter", "Pro", "Exclusive"]) await expect(page.getByRole("heading", { name: plan, exact: true })).toBeVisible();
  if (!process.env.STRIPE_SECRET_KEY) await expect(page.getByText("Plans open soon")).toBeVisible();
});

test("mail: send a test-mode postcard from a lead, see it on the Mail tab, cancel it", async ({ page }, info) => {
  await signInQa(page);
  // Each project takes a different home so parallel runs don't trip the 30-day rule.
  const n = (info.project.name === "phone" ? 5 : 25) + Math.floor(Math.random() * 15);
  await page.locator("main [data-lead-link]:visible").nth(n).click();
  await expect(page.getByRole("heading", { name: "Why this home" })).toBeVisible({ timeout: 15_000 });
  await page.locator("main").getByRole("link", { name: "Mail", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Send postcards" })).toBeVisible();
  await expect(page.getByText(/of 1 homes will get a postcard/)).toBeVisible({ timeout: 20_000 });
  // On a long-lived local DB this home may already have a card from an earlier run (30-day rule).
  if (await page.getByText("0 of 1 homes will get a postcard").isVisible()) {
    await expect(page.getByText("mailed in the last 30 days")).toBeVisible();
    return;
  }
  await page.getByRole("button", { name: /^Send 1 postcard$/ }).click();
  await expect(page.getByRole("heading", { name: "1 postcard queued" })).toBeVisible({ timeout: 30_000 });
  await page.goto("mail");
  await page.getByRole("button", { name: /Cancel \(\d+ min left\)/ }).first().click();
  await expect(page.getByRole("heading", { name: "Recent batches" })).toBeVisible();
});

test("homeowner opt-out page answers the same for any address", async ({ page }) => {
  await page.goto("optout");
  await page.getByLabel("Street address").fill("99999 Nowhere Rd");
  await page.getByLabel("ZIP code").fill("44107");
  await page.getByRole("button", { name: "Stop mail" }).click();
  await expect(page.getByText("Got it. We'll stop mail to this address within 2 business days.")).toBeVisible();
});
