// usage: node ci-wait.mjs <branch> [maxMinutes]  -> waits for the latest CI run, prints job results
import { execFileSync } from "node:child_process";

const [branch, maxMin = "25"] = process.argv.slice(2);
const token = execFileSync("git", ["credential", "fill"], { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" })
  .match(/^password=(.*)$/m)?.[1];
const api = (p) => fetch(`https://api.github.com/repos/216LABS/216LEADS${p}`, {
  headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "216leads-dev" },
}).then((r) => r.json());

const until = Date.now() + Number(maxMin) * 60_000;
let run;
while (Date.now() < until) {
  const runs = await api(`/actions/runs?branch=${encodeURIComponent(branch)}&per_page=20`);
  run = (runs.workflow_runs ?? []).find((r) => r.name === "CI");
  if (run && run.status === "completed") break;
  await new Promise((r) => setTimeout(r, 20_000));
}
if (!run) { console.log("no run found"); process.exit(1); }
console.log(`run ${run.id} ${run.status} ${run.conclusion} ${run.html_url}`);
const jobs = await api(`/actions/runs/${run.id}/jobs`);
for (const j of jobs.jobs ?? []) {
  const secs = j.completed_at ? Math.round((Date.parse(j.completed_at) - Date.parse(j.started_at)) / 1000) : null;
  console.log(`- ${j.name}: ${j.conclusion ?? j.status} (${secs ?? "?"}s)`);
  for (const s of j.steps ?? []) if (s.conclusion === "failure") console.log(`    failed step: ${s.name}`);
}
