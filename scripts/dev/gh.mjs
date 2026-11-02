// Minimal GitHub REST helper. usage: node gh.mjs <METHOD> <path> [jsonBody]
// The token comes from the git credential helper in-process and is never printed.
import { execFileSync } from "node:child_process";

const [method, path, body] = process.argv.slice(2);
const cred = execFileSync("git", ["credential", "fill"], { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" });
const token = cred.match(/^password=(.*)$/m)?.[1];
if (!token) throw new Error("no GitHub credential available");
const res = await fetch(`https://api.github.com/repos/216LABS/216LEADS${path}`, {
  method,
  headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "216leads-dev" },
  body: body ?? undefined,
});
const text = await res.text();
let json;
try { json = JSON.parse(text); } catch { json = text; }
const brief = (j) => (j && typeof j === "object" ? { message: j.message, merged: j.merged, sha: j.sha, html_url: j.html_url, state: j.state, base: j.base?.ref } : j);
console.log(res.status, JSON.stringify(Array.isArray(json) ? json.length : brief(json)));
