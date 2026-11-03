import "server-only";
import { appEnv, basePath } from "@216leads/shared";

/**
 * Absolute app root (origin + base path) for server redirects and Stripe return URLs.
 * Behind the 216labs.dev rewrite the request host is the vercel.app target, so outside local
 * dev the origin comes from APP_BASE_URL, never from the request (issue #70).
 */
export function appOrigin(req: Request): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (!configured && appEnv() !== "local") throw new Error("APP_BASE_URL is not set; it is required outside local dev.");
  return `${(configured || new URL(req.url).origin).replace(/\/$/, "")}${basePath()}`;
}

/** Absolute URL for an in-app path such as "/onboarding?x=1", for NextResponse.redirect. */
export function appUrl(req: Request, path: string): URL {
  return new URL(`${appOrigin(req)}${path.startsWith("/") ? path : `/${path}`}`);
}
