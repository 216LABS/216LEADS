import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

/** Repo root: the directory holding pnpm-workspace.yaml. */
export function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = resolve(dir, "..");
  }
  return process.cwd();
}

let loaded = false;

/** Load the repo-root .env once. Values already in process.env win. */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = join(repoRoot(), ".env");
  if (existsSync(file)) config({ path: file, quiet: true } as Parameters<typeof config>[0]);
}

export function requireEnv(name: string): string {
  loadEnv();
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}. See .env.example.`);
  return v;
}

export function optionalEnv(name: string): string | undefined {
  loadEnv();
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}
