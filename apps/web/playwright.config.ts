import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL is the app root including the base path, e.g. a Vercel preview's
// "https://...vercel.app/homesignal/" or the local "http://localhost:3000/". Tests use relative
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
    { name: "phone", use: { ...devices["Pixel 7"] }, testIgnore: /(crawl|features)\.spec/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /(crawl|features)\.spec/ },
    // The link crawl and the feature walk run after the smoke flows, one after the other: they share
    // the QA login, and running alongside slowed clicks past the timeouts, spent the daily CSV
    // export cap and hit the 60-a-minute API limit (issues #70, #72).
    { name: "crawl", use: { ...devices["Desktop Chrome"] }, testMatch: /crawl\.spec/, dependencies: ["phone", "desktop"] },
    { name: "features", use: { ...devices["Desktop Chrome"] }, testMatch: /features\.spec/, dependencies: ["crawl"] },
  ],
});
