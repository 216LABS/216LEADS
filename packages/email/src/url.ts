import { optionalEnv } from "@216leads/db";
import { basePath } from "@216leads/shared";

/** Absolute link into the app: APP_BASE_URL (origin) + base path + path. */
export function appUrl(path: string): string {
  const origin = (optionalEnv("APP_BASE_URL") ?? "http://localhost:3000").replace(/\/$/, "");
  return `${origin}${basePath()}${path.startsWith("/") ? path : `/${path}`}`;
}
