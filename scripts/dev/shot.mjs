// usage: node shot.mjs <outPrefix> <email|-> <password|-> <path> [path...]  (env WIDTH=390 for phone, HEIGHT to change the viewport)
import { createRequire } from "node:module";
const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const [out, email, password, ...paths] = process.argv.slice(2);
const base = process.env.BASE ?? "http://localhost:3000";
const width = Number(process.env.WIDTH ?? 1280);
const browser = await chromium.launch();
const height = Number(process.env.HEIGHT ?? (width < 600 ? 844 : 900));
const page = await browser.newPage({ viewport: { width, height } });
page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text().slice(0, 300)); });
page.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 300)));
if (email && email !== "-") {
  await page.goto(`${base}/login`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 }).catch(() => console.log("login: still on", page.url()));
}
let i = 0;
for (const p of paths) {
  await page.goto(`${base}${p}`, { waitUntil: "networkidle" }).catch((e) => console.log("goto", p, e.message));
  const file = `${out}-${i++}.png`;
  await page.screenshot({ path: file, fullPage: process.env.FULL === "1" });
  console.log(p, "->", page.url(), file);
}
await browser.close();
