// Post-deploy check for the base-path deploy (M12): node scripts/dev/check-deploy.mjs https://216labs.dev/leads
// Fetches the public pages and the health route, and checks that page assets are served under the base path.
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const path = new URL(base).pathname.replace(/\/$/, "");
const pages = ["", "/pricing", "/sample", "/sample/roofing/44107", "/coverage", "/terms", "/privacy", "/data", "/refunds", "/optout", "/login", "/signup"];
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) failed++; };

for (const p of pages) {
  const res = await fetch(`${base}${p}`, { redirect: "follow" });
  const html = await res.text();
  check(res.status === 200, `${p || "/"} ${res.status}`);
  if (p === "" && res.status === 200) {
    const assets = [...html.matchAll(/(?:src|href)="(\/[^"]*_next\/[^"]+)"/g)].map((m) => m[1]);
    check(assets.length > 0 && assets.every((a) => a.startsWith(`${path}/_next/`)), `assets under ${path || "/"}_next (${assets.length})`);
    if (assets[0]) check((await fetch(new URL(assets[0], base).href)).status === 200, `asset loads: ${assets[0]}`);
  }
}
const h = await fetch(`${base}/api/health`);
const body = await h.json().catch(() => ({}));
check(h.status === 200 && body.db === "ok", `api/health ${h.status} db=${body.db} ingest_ok=${body.ingest?.ok}`);
const app = await fetch(`${base}/leads`, { redirect: "manual" });
check([307, 308].includes(app.status) && (app.headers.get("location") ?? "").includes(`${path}/login`), `signed-out /leads -> ${app.headers.get("location")}`);
process.exit(failed ? 1 : 0);
