import { basePath } from "@216leads/shared";

/** Public origin (APP_BASE_URL, read at build time), without the base path. */
export function siteOrigin(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3000").trim().replace(/\/$/, "");
}

/** Public origin + base path, for robots and the sitemap. */
export const siteUrl = () => `${siteOrigin()}${basePath()}`;

/** Public marketing pages, for the sitemap. */
export const PUBLIC_PAGES = ["", "/pricing", "/sample", "/coverage", "/data", "/terms", "/privacy", "/refunds", "/optout"];

/** Signed-in and private paths kept out of search (prospect lists at /l/ are shared by private link). */
export const PRIVATE_PATHS = ["/leads", "/map", "/mail", "/roi", "/settings", "/onboarding", "/admin", "/fix-list", "/help", "/invite", "/l/", "/auth", "/api"];
