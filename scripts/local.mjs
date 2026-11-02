#!/usr/bin/env node
// One command to run 216 HomeSignal locally:
//   1. make sure Docker is running
//   2. start the local Supabase stack (Postgres + PostGIS + Auth + Mailpit)
//   3. create .env from .env.example and fill Supabase keys from the running stack
//   4. apply migrations
//   5. load real-data fixtures if the database has no homes yet
//   6. start the web app on http://localhost:3000
//
// Flags: --no-dev (stop after step 5), --reseed (reload fixtures even if data exists)
import { spawnSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const isWin = platform() === "win32";
const bin = (name) => join(root, "node_modules", ".bin", isWin ? `${name}.cmd` : name);

function step(msg) {
  console.log(`\n\x1b[38;5;208m▶\x1b[0m ${msg}`);
}

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: opts.capture ? "pipe" : "inherit", encoding: "utf8", shell: isWin });
  if (r.status !== 0 && !opts.allowFail) {
    if (opts.capture) process.stderr.write(r.stderr || r.stdout || "");
    console.error(`\nFailed: ${cmd} ${cmdArgs.join(" ")}`);
    process.exit(r.status ?? 1);
  }
  return r;
}

function dockerUp() {
  return spawnSync("docker", ["info"], { stdio: "ignore", shell: isWin }).status === 0;
}

async function ensureDocker() {
  step("Checking Docker");
  if (dockerUp()) return;
  const desktop = isWin
    ? "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"
    : platform() === "darwin" ? "/Applications/Docker.app" : null;
  if (desktop && existsSync(desktop)) {
    console.log("Starting Docker Desktop...");
    if (platform() === "darwin") spawn("open", ["-a", "Docker"], { detached: true, stdio: "ignore" }).unref();
    else spawn(desktop, [], { detached: true, stdio: "ignore" }).unref();
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      if (dockerUp()) return;
    }
  }
  console.error("Docker is not running. Start Docker Desktop and run `pnpm local` again.");
  process.exit(1);
}

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}

function ensureEnvFile() {
  step("Preparing .env");
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) {
    copyFileSync(join(root, ".env.example"), envPath);
    console.log("Created .env from .env.example");
  }
  const status = run(bin("supabase"), ["status", "-o", "env"], { capture: true });
  const sb = parseEnv(status.stdout);
  const fill = {
    NEXT_PUBLIC_SUPABASE_URL: sb.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: sb.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: sb.SERVICE_ROLE_KEY,
    DATABASE_URL: sb.DB_URL,
    DATABASE_URL_DIRECT: sb.DB_URL,
    // Local only: the seeded demo login can open /admin. Set your own list in production.
    ADMIN_EMAILS: "demo@216leads.test",
  };
  let text = readFileSync(envPath, "utf8");
  const current = parseEnv(text);
  let changed = 0;
  for (const [k, v] of Object.entries(fill)) {
    if (!v || current[k]) continue;
    const re = new RegExp(`^${k}=.*$`, "m");
    text = re.test(text) ? text.replace(re, `${k}=${v}`) : `${text.trimEnd()}\n${k}=${v}\n`;
    changed++;
  }
  if (changed) {
    writeFileSync(envPath, text);
    console.log(`Filled ${changed} Supabase value(s) in .env from the local stack`);
  }
  if (sb.MAILPIT_URL || sb.INBUCKET_URL) console.log(`Local auth emails: ${sb.MAILPIT_URL || sb.INBUCKET_URL}`);
}

await ensureDocker();

if (!existsSync(join(root, "node_modules"))) {
  step("Installing dependencies");
  run("pnpm", ["install"]);
}

step("Starting local Supabase (Postgres + PostGIS + Auth)");
run(bin("supabase"), ["start"]);

ensureEnvFile();

step("Applying migrations");
run("pnpm", ["--silent", "db:migrate"]);

step("Loading data");
run("pnpm", ["--silent", "db:seed", ...(args.has("--reseed") ? ["--", "--force"] : [])]);

if (args.has("--no-dev")) {
  console.log("\nReady. Start the app with `pnpm dev`.");
  process.exit(0);
}

step("Starting 216 HomeSignal at http://localhost:3000");
const dev = spawn("pnpm", ["dev"], { cwd: root, stdio: "inherit", shell: isWin });
dev.on("exit", (code) => process.exit(code ?? 0));
