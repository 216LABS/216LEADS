// Polite HTTP for public sources: identifying UA, 1 request/second per host,
// 3 retries with exponential backoff on 5xx/timeouts (spec 5.0 and 14).
import { optionalEnv } from "@216leads/db";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const nextSlot = new Map<string, number>();
const browserUaHosts = new Set<string>();

export function userAgent(): string {
  return optionalEnv("INGEST_USER_AGENT") ?? "216Leads/1.0 (+https://216labs.dev/leads/data)";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitTurn(host: string, minIntervalMs: number) {
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, at + minIntervalMs);
  if (at > now) await sleep(at - now);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface FetchOpts {
  minIntervalMs?: number;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string | URLSearchParams | FormData;
}

export async function politeFetch(url: string, opts: FetchOpts = {}): Promise<Response> {
  const host = new URL(url).host;
  const retries = opts.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await waitTurn(host, opts.minIntervalMs ?? 1000);
    const ua = browserUaHosts.has(host) ? BROWSER_UA : userAgent();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 90_000);
    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        body: opts.body,
        headers: { "User-Agent": ua, Accept: "*/*", ...(opts.headers ?? {}) },
        signal: ctl.signal,
      });
      if (res.status === 403 && !browserUaHosts.has(host)) {
        // Spec 5.0: if the identifying UA is refused, fall back to a standard browser UA. Nothing beyond that.
        browserUaHosts.add(host);
        lastErr = new HttpError(403, `403 from ${host}; retrying with browser UA`);
        continue;
      }
      if (res.status >= 500 || res.status === 429) {
        lastErr = new HttpError(res.status, `${res.status} from ${url}`);
        await sleep(1000 * 2 ** (attempt + 1));
        continue;
      }
      if (!res.ok) throw new HttpError(res.status, `${res.status} ${res.statusText} from ${url}`);
      return res;
    } catch (e) {
      if (e instanceof HttpError && e.status < 500 && e.status !== 429 && e.status !== 403) throw e;
      lastErr = e;
      if (attempt < retries) await sleep(1000 * 2 ** (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await politeFetch(url, opts);
  return (await res.json()) as T;
}
