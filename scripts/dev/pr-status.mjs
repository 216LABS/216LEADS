// usage: node pr-status.mjs 20 22 23 ...  -> CI conclusion for each PR's head commit
import { execFileSync } from "node:child_process";
const token = execFileSync("git", ["credential", "fill"], { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" })
  .match(/^password=(.*)$/m)?.[1];
const api = (p) => fetch(`https://api.github.com/repos/216LABS/216LEADS${p}`, {
  headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "216leads-dev" },
}).then((r) => r.json());
for (const n of process.argv.slice(2)) {
  const pr = await api(`/pulls/${n}`);
  const runs = await api(`/commits/${pr.head.sha}/check-runs?per_page=50`);
  const ci = (runs.check_runs ?? []).filter((c) => !/label|title/i.test(c.name));
  const summary = ci.map((c) => `${c.name.split(" ")[0]}=${c.conclusion ?? c.status}`).join(", ");
  console.log(`#${n} mergeable=${pr.mergeable} | ${pr.title.slice(0, 60)} | ${summary || "no checks"}`);
}
