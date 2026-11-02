import { join } from "node:path";
import { config as loadDotenv } from "dotenv";
import type { NextConfig } from "next";

// Secrets live in the repo-root .env (shared with the ingest CLI).
loadDotenv({ path: join(process.cwd(), "..", "..", ".env"), quiet: true } as Parameters<typeof loadDotenv>[0]);

const nextConfig: NextConfig = {
  transpilePackages: ["@216leads/db", "@216leads/scoring", "@216leads/shared", "@216leads/ingest"],
  serverExternalPackages: ["postgres", "exceljs"],
  poweredByHeader: false,
  typedRoutes: false,
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_MAP_STYLE_URL: process.env.NEXT_PUBLIC_MAP_STYLE_URL,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  },
};

export default nextConfig;
