// Smoke test (DevOps addendum D2). Grows with the product: onboarding (A2/M4), CRM stage
// changes (M5) and a test-mode postcard (M8) are added by those milestones.
import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "qa@216leads.test";
const password = process.env.E2E_PASSWORD ?? "qa-216-leads-local";

test("QA login sees scored leads", async ({ page }) => {
  await page.goto("login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/leads(\?|$)/);
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  // Not production: the environment banner is always shown.
  await expect(page.getByRole("note")).toContainText(/STAGING|LOCAL/);
  const firstLead = page.locator("main li a").first();
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
  await expect(page).toHaveURL(/\/leads(\?|$)/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  await expect(page.locator("main li a").first()).toBeVisible();
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
