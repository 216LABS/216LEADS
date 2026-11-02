# 216 HomeSignal

**Know which homes need you next.** 216 HomeSignal (by 216LABS) ranks Northeast Ohio homes for a home-service trade using free public records (county parcels and sales, city permits, code violations, tree canopy, flood zones) and shows the reasons behind every score. Then it lets the business act: a small pipeline, postcards to one home or a whole block, and an ROI report backed by later public permits.

Served at **216labs.dev/homesignal**.

## Run it locally (one command)

Requirements: Node 20+, pnpm 10, Docker Desktop.

```bash
pnpm install
pnpm local
```

`pnpm local` starts Docker if needed, starts the local Supabase stack (Postgres + PostGIS + Auth), creates `.env` from `.env.example` with the local keys, applies migrations, loads real-data fixtures when the database is empty, and starts the app at **http://localhost:3000**.

- Sign up with any email and password (email confirmation is off locally), pick a trade, and you land on scored leads.
- Or sign in to the seeded demo: `demo@216leads.test` / `demo-roofing-216` (Demo Roofing, ZIPs 44107 and 44111). This login exists only in your local database.
- Magic-link and other auth emails go to the local mail catcher at http://127.0.0.1:54324; customer emails land in the `email_outbox` table (see `/admin/outbox`).
- No paid keys are needed: without Stripe the app stays on the trial, without Lob postcards go to a dry-run provider, without an LLM key the wizard uses the closest trade preset.

### Load the full real data

Fixtures are 2,000 homes in 44107 and 44111. To pull everything (1 request/second per host):

```bash
pnpm ingest:cleveland            # Cuyahoga County + City of Cleveland, about 30 minutes
pnpm ingest pipeline counties    # Lake, Stark, Medina and Summit, then match, signals, score
```

`pnpm ingest jobs` lists every job; `pnpm ingest run <job> [--full] [--zips 44111,44107]` runs one; `pnpm ingest pipeline daily` is what the scheduler runs each morning.

## What's in it

- **Leads:** ranked homes with record-backed reasons, filters, swipe/table views, lead detail with timeline, notes, won/lost, CSV export, fix list of open code violations.
- **Map** (Pro): pins and layers, lasso to mail, neighbor ring, competitor tracker, heat map.
- **Mail:** postcard builder, send screen with suppression and the 30-day rule, 15-minute undo, auto-mail, Lob webhooks, homeowner opt-out.
- **ROI** (Pro): attribution of later permits and sales, metrics, proof from public records, monthly PDF.
- **Scoring:** 15 trade presets, AI profile wizard, recipe versions, learned weights from wins and losses.
- **Coverage:** Cuyahoga parcels, sales, canopy; Cleveland permits, violations and more; Lake parcels and monthly permits; Stark sales; Medina and Summit permits; records-request imports for other towns.
- **Billing:** Stripe plans, founding offer, monthly postcard credits, exclusive ZIPs.
- **Public site:** landing, pricing, sample per trade + ZIP, coverage, legal pages, help.

## Repo layout

```
apps/web            Next.js app (App Router, Tailwind): marketing site, app, API routes
packages/db         SQL migrations (source of truth), Drizzle schema, migration runner
packages/scoring    Pure TypeScript scoring engine + trade templates (YAML)
packages/ingest     Public-data adapters, matcher, signals, scoring, mail, billing, CLI, fixtures
packages/email      React Email templates and the provider (Resend or local outbox)
packages/shared     Address normalizer, contractor names, dates, plans, constants
```

## Tests

```bash
pnpm lint && pnpm typecheck && pnpm test    # unit tests (Vitest)
pnpm test:integration                       # needs a migrated, seeded database (see docs/HANDOFF.md)
pnpm test:e2e                               # Playwright smoke on phone and desktop
```

CI runs all of them on every PR, plus gitleaks and a Playwright smoke against a production build.

## Deploying

See `docs/DEPLOY.md` (base path under 216labs.dev/homesignal, environment variables, webhooks, post-deploy check) and `docs/ENVIRONMENTS.md`. `PLAN.md` has the milestones and decisions; `BUILD_SPEC.md` is the full spec.

---

Built from public records. May be incomplete or out of date. Not a consumer report; do not use for credit, insurance, employment or housing decisions.
