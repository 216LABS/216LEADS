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

test("a new user can sign up and lands on setup", async ({ page }) => {
  await page.goto("signup");
  await page.getByLabel("Work email").fill(`e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@216leads.test`);
  await page.getByLabel("Password").fill("e2e-password-216");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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
