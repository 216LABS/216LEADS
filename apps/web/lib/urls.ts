import "server-only";
import { basePath } from "@216leads/shared";

/** Absolute app root (origin + base path) for redirects back from Stripe. APP_BASE_URL wins over the request. */
export function appOrigin(req: Request): string {
  const origin = (process.env.APP_BASE_URL ?? new URL(req.url).origin).replace(/\/$/, "");
  return `${origin}${basePath()}`;
}
