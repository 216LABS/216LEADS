import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL is the app root including the base path, e.g. a Vercel preview's
// "https://...vercel.app/leads/" or the local "http://localhost:3000/". Tests use relative
// paths ("login", "leads") so the base path is kept.
const base = process.env.E2E_BASE_URL ?? "http://localhost:3000/";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: base.endsWith("/") ? base : `${base}/`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
