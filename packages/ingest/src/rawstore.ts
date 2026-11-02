// Raw payload store (spec 5.0): gzip pages at {bucket}/{source}/{yyyy-mm-dd}/{offset}.json.gz.
// Pages are stored after DROP fields are removed. Local disk by default.
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { isAbsolute, join } from "node:path";
import { optionalEnv, repoRoot } from "@216leads/db";
import { todayEt } from "@216leads/shared";

export interface RawStore {
  put(source: string, key: string | number, payload: unknown): string;
  purgeOlderThan(days: number): number;
}

export class FsRawStore implements RawStore {
  constructor(private base: string) {}

  put(source: string, key: string | number, payload: unknown): string {
    const day = todayEt();
    const dir = join(this.base, source, day);
    mkdirSync(dir, { recursive: true });
    const rel = `${source}/${day}/${key}.json.gz`;
    writeFileSync(join(this.base, rel), gzipSync(JSON.stringify(payload)));
    return rel;
  }

  /** Data retention: raw payloads are kept 180 days (spec 14). */
  purgeOlderThan(days: number): number {
    const cutoff = Date.now() - days * 86_400_000;
    let removed = 0;
    let sources: string[] = [];
    try {
      sources = readdirSync(this.base);
    } catch {
      return 0;
    }
    for (const s of sources) {
      for (const d of readdirSync(join(this.base, s))) {
        const p = join(this.base, s, d);
        if (/^\d{4}-\d{2}-\d{2}$/.test(d) && statSync(p).mtimeMs < cutoff) {
          rmSync(p, { recursive: true, force: true });
          removed++;
        }
      }
    }
    return removed;
  }
}

let store: RawStore | null = null;

export function rawStore(): RawStore {
  if (!store) {
    const b = optionalEnv("INGEST_RAW_BUCKET") ?? ".data/raw";
    store = new FsRawStore(isAbsolute(b) ? b : join(repoRoot(), b));
  }
  return store;
}
