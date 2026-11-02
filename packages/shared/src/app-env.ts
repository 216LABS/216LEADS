// Environment awareness (DevOps addendum D1). Outside production, real postcards and real
// charges are blocked in code, even if a live key is misconfigured.

export type AppEnv = "production" | "staging" | "local";

export function appEnv(): AppEnv {
  const v = (typeof process !== "undefined" ? process.env.APP_ENV ?? process.env.NEXT_PUBLIC_APP_ENV : undefined) ?? "local";
  return v === "production" || v === "staging" ? v : "local";
}

export const isProduction = () => appEnv() === "production";

export type LiveService = "stripe" | "lob" | "postgrid" | "resend";

/** True when a key would act on real money or real mail. */
export function isLiveKey(service: LiveService, key: string | null | undefined): boolean {
  if (!key) return false;
  switch (service) {
    case "stripe":
      return /^(sk|rk)_live_/.test(key);
    case "lob":
      return /^live_/.test(key);
    case "postgrid":
      return /^live_/.test(key);
    case "resend":
      return false; // Resend has no test/live split; sends are gated by liveSendsAllowed()
  }
}

export class LiveKeyBlockedError extends Error {
  constructor(service: LiveService, env: AppEnv) {
    super(`${service}: live key refused because APP_ENV=${env}. Use test keys outside production.`);
    this.name = "LiveKeyBlockedError";
  }
}

/** Throw if a live key would be used outside production. Call before creating any client. */
export function assertKeyAllowed(service: LiveService, key: string | null | undefined, env: AppEnv = appEnv()): void {
  if (env !== "production" && isLiveKey(service, key)) throw new LiveKeyBlockedError(service, env);
}

/** Real postcards and real customer email only go out from production. */
export const liveSendsAllowed = (env: AppEnv = appEnv()) => env === "production";

/** Path prefix the app is served under (production and staging: "/leads"). */
export function basePath(): string {
  const v = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BASE_PATH ?? "" : "";
  return v === "/" ? "" : v.replace(/\/$/, "");
}

export const withBase = (path: string) => `${basePath()}${path.startsWith("/") ? path : `/${path}`}`;
