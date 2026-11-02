import { defineConfig } from "vitest/config";

// Integration tests need a migrated, seeded database (DATABASE_URL). CI runs them against a
// Postgres + PostGIS service container: `pnpm db:migrate && pnpm db:seed && pnpm test:integration`.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.int.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
