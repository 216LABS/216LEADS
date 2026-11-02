import { join } from "node:path";
import { config as loadDotenv } from "dotenv";
import type { NextConfig } from "next";

// Secrets live in the repo-root .env (shared with the ingest CLI).
loadDotenv({ path: join(process.cwd(), "..", "..", ".env"), quiet: true } as Parameters<typeof loadDotenv>[0]);

// Production and staging serve the app under 216labs.dev/leads; local runs at the root.
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  transpilePackages: ["@216leads/db", "@216leads/scoring", "@216leads/shared", "@216leads/ingest", "@216leads/email"],
  serverExternalPackages: ["postgres", "exceljs"],
  poweredByHeader: false,
  // Legal and help text is read from content/*.mdx at request time (issues #3, #7).
  outputFileTracingIncludes: { "/**": ["./content/**/*"] },
  typedRoutes: false,
  env: {
    NEXT_PUBLIC_APP_ENV: process.env.APP_ENV ?? "local",
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_MAP_STYLE_URL: process.env.NEXT_PUBLIC_MAP_STYLE_URL,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // Release tag for Sentry: the git SHA on Vercel and in CI.
    NEXT_PUBLIC_RELEASE: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "",
  },
};

export default nextConfig;
