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

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("leads");
  await expect(page).toHaveURL(/\/login\?next=/);
});
