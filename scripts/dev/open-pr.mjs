// usage: node open-pr.mjs <head> <base> <title> <bodyFile>
// Reads the GitHub token from the git credential helper in-process; never prints it.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [head, base, title, bodyFile] = process.argv.slice(2);
const cred = execFileSync("git", ["credential", "fill"], { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" });
const token = cred.match(/^password=(.*)$/m)?.[1];
if (!token) throw new Error("no GitHub credential available");
const res = await fetch("https://api.github.com/repos/216LABS/216LEADS/pulls", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "216leads-dev" },
  body: JSON.stringify({ head, base, title, body: readFileSync(bodyFile, "utf8") }),
});
const json = await res.json();
console.log(res.status, json.html_url ?? json.message ?? "", json.errors ? JSON.stringify(json.errors) : "");
