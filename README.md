# 216 Leads

**Know which homes need you next.** 216 Leads (by 216LABS) ranks Northeast Ohio homes for a home-service trade using free public records (county parcels and sales, city permits, code violations, tree canopy, flood zones) and shows the reasons behind every score.

## Run it locally

Requirements: Node 20+, pnpm 10, Docker Desktop.

```bash
pnpm install
pnpm local
```

`pnpm local` starts Docker if needed, starts the local Supabase stack (Postgres + PostGIS + Auth), creates `.env` from `.env.example` with the local keys, applies migrations, loads real-data fixtures when the database is empty, and starts the app at **http://localhost:3000**.

- Sign up with any email and password (email confirmation is off locally), pick a trade, and you will land on scored leads.
- Or sign in to the seeded demo: `demo@216leads.test` / `demo-roofing-216` (Demo Roofing, zips 44107 and 44111). This login exists only in your local database.
- Magic-link and other auth emails go to the local mail catcher at http://127.0.0.1:54324.

### Load the full real data

Fixtures are 2,000 homes in 44107 and 44111. To pull everything for Cuyahoga County and the City of Cleveland (about 30 minutes, 1 request/second per host):

```bash
pnpm ingest:cleveland
```

Other jobs: `pnpm ingest jobs` lists them; `pnpm ingest run <job> [--full] [--zips 44111,44107]` runs one.

## Repo layout

```
apps/web            Next.js 15 app (App Router, Tailwind)
packages/db         SQL migrations (source of truth), Drizzle schema, migration runner
packages/scoring    Pure TypeScript scoring engine + trade templates (YAML)
packages/ingest     Public-data adapters, matcher, signals, scoring jobs, CLI, fixtures
packages/shared     Address normalizer, contractor names, dates, constants
```

## Tests

```bash
pnpm test        # unit tests (Vitest)
pnpm typecheck
```

See `PLAN.md` for milestones and decisions, and `BUILD_SPEC.md` for the full spec.

---

Built from public records. May be incomplete or out of date. Not a consumer report; do not use for credit, insurance, employment or housing decisions.
