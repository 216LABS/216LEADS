# 216 Leads build plan

Source of truth: `BUILD_SPEC.md`, plus `ADDENDUM_PROFILE_WIZARD.md` and `ADDENDUM_DEVOPS.md` (both add to the spec, replace nothing). Product and UX context: `216_LEADS_PLAN.md`.
Product name: **216 Leads** (by 216LABS), served at 216labs.dev/leads.

Each milestone is finished only after it runs locally, its checks pass, it is committed, and its box below is ticked.
Since M2, every change goes through a pull request on github.com/216LABS/216LEADS. During the build phase PRs are self-merged once CI is green; review-before-merge and branch protection start at launch.

## Milestones

### M1: Thin end-to-end slice
- [x] Monorepo scaffold (pnpm workspaces + Turborepo, strict TS), `.env.example`, `.gitignore`
- [x] Local Supabase stack (Postgres + PostGIS + Auth) and a migration runner over `packages/db/migrations`
- [x] Shared ArcGIS adapter (paging, count check, retry/backoff, 1 req/s per host, UA, DROP fields, raw page store)
- [x] `cuy_parcels` ingest (residential parcels + sale events, owner fields dropped)
- [x] `cle_permits` ingest (matched by parcel id)
- [x] Signals + scoring for one trade (roofing) and lead generation for an org
- [x] Sign in, then a ranked lead list
- Check: real ingest for Cleveland runs; a signed-in user sees ranked roofing leads with reasons

### M2: Full Cuyahoga + Cleveland data
- [x] Cleveland: violations, rentals, condemnations, demolition, boardup, 2022 survey, contractor registry
- [x] County: canopy (CCPC), parcel centroids, FEMA flood zones
- [x] Address matcher tiers (parcel id, exact, fuzzy, geo) + `unmatched_record` retry
- [x] `job_run` bookkeeping, `source` table, `/admin/jobs` and `/admin/unmatched`
- Check: second run upserts 0 changed rows; at least 99% of Cleveland permits match a parcel; no owner-name strings in any table
- Result: permits/violations/parcels second run changed 0 rows; Cleveland permits match 99.21% (violations 99.16%, rentals 99.43%); `pnpm ingest run privacy_audit` found no owner names (see below)

### D1: Branches and environments (DevOps addendum)
- [x] `main` = production; every change is a PR; Vercel preview per PR using staging env vars (`vercel.json`, env docs)
- [x] `APP_ENV` = production | staging | local: "STAGING" banner when not production; real mail sends and real charges blocked in code outside production even with a live key
- [x] `pnpm seed:staging`: fixed real public parcels + 3 test orgs (HVAC, roofing, fence) + QA login; never customer data
- [x] Staging/production Supabase projects documented (`docs/ENVIRONMENTS.md`)
- Done in code: `APP_ENV` + banner, live-key guard with tests, `/leads` base path (production build verified), `pnpm seed:staging`, `apps/web/vercel.json`, `docs/ENVIRONMENTS.md`. Creating the Vercel project and the two Supabase cloud projects needs the 216LABS accounts; the steps are in `docs/ENVIRONMENTS.md`.

### D2: CI on every PR (DevOps addendum)
- [x] `ci.yml` on pull_request: install (cached), typecheck, lint, unit tests, build
- [x] Migrations against a Postgres+PostGIS service container, then integration tests (scoring, recipe validation, A8 golden tests)
- [x] Playwright smoke against the PR's Vercel preview: QA login, onboarding, leads, CRM stage change, queue a test-mode postcard
- [ ] (deferred until launch: build mode) Branch protection on `main`: CI must pass and a review is required; runs under 10 minutes
- Notes: the smoke job runs against the app built inside CI on a local Supabase stack until Vercel previews exist; setting the repository variable `E2E_BASE_URL` points it at a preview. Lint is ESLint 9 with the TypeScript and Next recommended rules. The smoke test grows with onboarding (A2/M4), CRM stages (M5) and test-mode postcards (M8).

### D3: Error tracking and uptime (DevOps addendum)
- [x] `@sentry/nextjs` in the app and Sentry in the ingest worker, tagged with `APP_ENV` and release (git SHA); client errors sampled down
- [x] `/leads/api/health` (DB connection + last ingest age) for the Sentry uptime monitor
- [x] Email alert when a nightly ingest has not succeeded in 36 hours
- Notes: Sentry stays off until `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set (account later). `ingest_run` is a view over `job_run`. The watchdog runs from `.github/workflows/watchdog.yml` via `/api/cron/ingest_watchdog` once `PRODUCTION_APP_URL` and `CRON_SECRET` secrets exist; without Resend it writes alerts to `.data/outbox`.

### D4: Database safety (DevOps addendum)
- [x] Workflow on merge to `main`: apply migrations to staging, then production after staging succeeds
- [x] Weekly encrypted `pg_dump` as a workflow artifact (off-site copy)
- [x] `docs/ROLLBACK.md` (Vercel instant rollback, backup restore, two-step destructive migrations)
- Notes: the migrate and backup workflows skip with a notice until `STAGING_DATABASE_URL`, `PRODUCTION_DATABASE_URL` and `BACKUP_ENCRYPTION_KEY` exist. Migrations stay on our runner (`packages/db/migrations`, tracked in `_migrations`) rather than the Supabase CLI's folder (decision 3). CI also fails PRs that edit a merged migration and warns on `drop column/table`.

### D8: Repo setup for the backlog loop (DevOps addendum)
- [ ] Issue templates (bug, feature), labels (`ready`, `in-progress`, `needs-qa`, `blocked`, `bug`, `feature`, `p0`-`p3`, `risky`)
- [ ] PR template (`Closes #<issue>`, how to test on the preview); `CONTRIBUTING.md` describing the issue -> PR -> `needs-qa` loop

### D5: Security checks (DevOps addendum)
- [ ] Dependabot (npm + Actions, weekly, grouped minor/patch); gitleaks in CI; `npm audit --audit-level=high` (warn only)
- [ ] RLS test: a user from org A cannot read org B's leads, profiles, CRM rows or mail jobs
- [ ] Labeler action adds `risky` to PRs touching auth, Stripe, Lob sends, RLS policies or data deletion; PR template asks for a test plan

### D6 + D7: Usage events, feedback, release notes (DevOps addendum)
- [ ] `event` table with product events (signup, onboarding_done, lead_viewed, stage_changed, postcard_queued, checkout_started, subscribed)
- [ ] "Report a problem" link that emails support with page URL, org id and user id
- [ ] Conventional Commit PR titles; `.github/release.yml` for generated release notes; `CHANGELOG.md`

### A1: Template presets + adjacent-permit triggers (Addendum A)
- [ ] All 13 trade templates (7.5) as starting presets in YAML (the 7 that were in M11 move here)
- [ ] `new_build` category placed before `remodel` (A5); regexes checked against real Cleveland and Lake permit text; categories with fewer than 20 real matches flagged low-confidence in the UI
- [ ] New trigger kind `permit` (same home, category, window) in the engine and template format; adjacent-permit triggers on presets per the A5 table
- [ ] `org_profile` and `recipe_version` tables; scoring reads the org's active recipe version; revert to any version in Settings
- Check: every preset validates against the recipe schema; a same-home roofing permit fires the gutters preset's trigger

### A2: AI business profile wizard (Addendum A)
- [ ] Wizard questions (A2) replace "pick your trade" in onboarding; territory via TerritoryPicker
- [ ] Recipe builder behind `LLM_PROVIDER` (anthropic | openai); prompt in `packages/scoring/profile/prompt.md` with the signal library and categories injected from code; zod validation, one retry, then fall back to the closest preset with no user-facing error
- [ ] Confirm screen: plain-English summary, live count from the scoring engine, 5 sample homes with real reasons, a slider per signal, "tweak it" with a diff
- [ ] `POST /api/profile/build`, `/api/profile/tweak`, `/api/profile/activate`
- [ ] Golden tests for 6 business types (roofer, HVAC, fence company, landscaper, dentist, insurance agent) per A8
- Check: a new user answers the questions, confirms the recipe and lands on scored leads

### M3: Scoring engine complete
- [ ] Full signal library (7.2) materialized in `parcel_signal`
- [ ] Category regex (7.3) with fixture tests (at least 90% per category)
- [ ] Triggers, hard filters, exclusions, reasons with evidence, pitch
- [ ] Incremental lead upsert; 50K parcels scored in under 5 s; determinism snapshot test

### M4: Onboarding around the wizard
- [ ] Preset path (trade tiles) for users who skip the AI questions; area step with live counts; perfect-customer controls (9.1 step 3) with live 5-home preview; brand; plan
- [ ] Territories, scoring profile and current-customer CSV suppression saved
- Check: new user signs up, picks a trade, describes their customer, lands on scored leads

### M5: CRM views
- [ ] Lead list: search, filter chips, sort, mobile cards with swipe, desktop table with multi-select
- [ ] Lead detail: reasons with evidence links, pitch, facts, timeline, notes, won/lost flows
- [ ] CSV export (no names, 2,000 rows/day cap)
- [ ] Settings: profile, territories, brand, digest, team invites, data coverage
- [ ] Coach marks, empty states, bottom tab bar / sidebar

### M6: Digest and email
- [ ] React Email digest + transactional templates
- [ ] Email provider interface (Resend, plus a local outbox when no key)
- [ ] `/api/cron/:job` with `CRON_SECRET`; job scheduler (GitHub Actions cron)

### M7: Billing
- [ ] Stripe Checkout, Customer Portal, webhooks (test mode only)
- [ ] Plans, trial, zip limits per plan, monthly postcard credits

### M8: Print and mail
- [ ] `MailProvider` interface; Lob (test keys only, live sends refused); PostGrid behind the same interface
- [ ] 3 system postcard templates per trade, builder with live preview and proof PDF
- [ ] Send flow with pre-send checks (10.3), cost preview, 15-minute cancel
- [ ] Auto-mail rules with caps; webhooks; returned mail goes to suppression; credits then metered billing

### M9: Map and market tools
- [ ] MapLibre map with lead pins and layers, lasso to mail
- [ ] Neighbor ring, competitor tracker, heat map

### M10: More counties and exclusivity
- [ ] Lake parcels + sales, Lake monthly permits XLSX, Medina permits, Stark sales
- [ ] Exclusivity lock (409 "Taken") and 72-hour visibility delay

### M11: Prove it
- [ ] Attribution matcher + ROI dashboard + monthly PDF
- [ ] Learned weights, violations fix list
- [ ] Records-request importer (CSV/XLSX/PDF), homeowner opt-out page
- [ ] Summit permits (best effort)
- [ ] Marketing site: landing, pricing, sample page with masked addresses, coverage, legal

### M12: Hardening and acceptance
- [ ] RLS SQL tests, webhook signature tests, mail pre-send check tests
- [ ] Playwright: onboarding, lead list, mark won, ROI shows it
- [ ] API rate limits; base-path deploy under 216labs.dev/leads; README one-command run; final acceptance pass

## Decisions

1. **Repo root** is `216_LEADS/` (where the spec files live). Packages use the `@216leads/*` scope. The old product name has been replaced everywhere, including in the spec documents; the plan document is now `216_LEADS_PLAN.md`.
2. **Local stack** is the Supabase CLI (`supabase start`): Postgres with PostGIS, Supabase Auth, and Mailpit for local auth emails. Unused services (realtime, storage, edge functions, analytics) are excluded to keep startup light.
3. **Migrations** live in `packages/db/migrations` and are applied by a small runner that records applied files in `_migrations`. The Supabase CLI's own migration folder is not used.
4. **Server data access** uses a direct Postgres connection (postgres.js + Drizzle). Every tenant query filters by the signed-in user's org, and every parcel read checks `org_parcel_keys`. RLS is still enabled as a second layer and is tested.
5. **Sign-in** offers email + password and magic link (both Supabase Auth). Google sign-in shows only when configured. Email confirmation is off locally.
6. **Raw payload store** writes gzip pages to `.data/raw/{source}/{date}/{offset}.json.gz` on local disk behind a `RawStore` interface. A Supabase Storage bucket can replace it later.
7. **Seed data** is real: `pnpm fixtures:pull` downloads small samples from the live endpoints (owner fields dropped) into `packages/ingest/fixtures`. `pnpm local` loads them when the DB is empty. `pnpm ingest:cleveland` pulls the full real data.
8. **UI** uses Tailwind with hand-written components in the shadcn style instead of the shadcn CLI.
9. **Scheduling**: no always-on scheduler locally. Jobs run via `pnpm ingest <job>`; production schedules are in a GitHub Actions workflow; light jobs are callable at `/api/cron/:job`.
10. **Email** without `RESEND_API_KEY` writes rendered emails to `.data/outbox` instead of sending.
11. **Stripe** runs only with test keys (`sk_test_`). Without keys the app stays on the free trial and billing buttons explain that billing is not configured.
12. **Lob** runs only with test keys (`test_`); the provider throws on a live key or `LOB_ENV=live`. Without a key, a dry-run provider records pieces locally and never contacts any service.
13. **Map tiles** default to OpenFreeMap's free style (no key); `NEXT_PUBLIC_MAP_STYLE_URL` overrides it.
14. **Signals are sparse**: a missing `parcel_signal` row means 0. Signals are computed for residential parcels only. "Current year" comes from the clock, not a hard-coded 2026.
15. **Rate limits** use an in-process token bucket (single instance), which is enough for one-person deployment.
16. **All county parcels are ingested (572,828), not only residential.** The spec's residential filter would leave commercial permits unmatched and make the "99% of Cleveland permits match" check impossible. Scoring, signals and leads use only residential land use (5100/5200/5300/5500), via `is_residential()`.
17. **Municipality comes from the county tax district** (part before "/"), not the postal city: postal "CLEVELAND" also covers parts of Brooklyn, Linndale, etc. Permit coverage is decided per municipality.
18. **Missing data uses the population average.** When a home's town publishes no permits (or has no survey), permit/violation/survey signals use the average value across homes that do have the data (`signal_prior`, recomputed by the `signals` job). Dropping those signals inflated suburban scores; counting them as zero sank them.
19. **Attribute signals are computed by the engine** from the parcel row (age, canopy, gas, owner-occupied...). Only event-derived signals (last permit per category, open violations, neighbor jobs, exclusion flags) are materialized in `parcel_signal`. This keeps the table small (about 100K rows) while scoring stays a single SQL + TS pass.
20. **Sale signals use arms-length sales only** (price >= $10,000), so $0 family transfers are not "just sold".
21. **Leads are rewritten when their reasons change**, in addition to the spec's 3-point / threshold rule, so "why this home" never goes stale. Leads that no longer qualify are deleted only if still "new" and untouched (no notes, mail or status change).
22. **Long ArcGIS queries go as form POSTs** (ArcGIS Online rejects long URLs).
27. **Cleveland's `DW_Parcel` is a second parcel id.** About 3% of Cleveland permits carry parcel number "0"; the city's own data-warehouse parcel id fills most of them (confidence 0.95, after the record's own parcel number). Together with the geo tier this takes permit matching from 96.4% to 99.2%.
28. **Geo tier also accepts address-less lots:** if no same-number parcel is within 30 m, the nearest parcel within 30 m that has no site address at all (new construction, post-demolition lots) matches at confidence 0.60.
29. **Category regex changes (spec 7.3), measured on 1,000 hand-labeled real Cleveland permits** (`packages/scoring/src/__fixtures__/categories.cle.json`, every category at 93% or better): stems accept plurals/-ing forms; the city's own permit category decides first; clauses naming *other* required permits are ignored; non-trade categories (board-up, signage, occupancy, elevator) and `new_build` match early; demolition means a whole structure; concrete means flatwork named early in the description. The file is now an ordered list so one category can have an early narrow rule.
30. **Records without a date are skipped and counted** (`skipped_no_date` on the job run), never given an invented date.
31. **No-owner-name check is a job, not a fixture.** `privacy_audit` fetches real owner names for a sample of stored homes live from the county and city, holds them only in memory, and searches every text column and the raw page store. Storing names in a test fixture would itself break the rule.
32. **Contractor names: businesses only.** Cleveland's `CONTRACTOR_NAME` is the license holder and is sometimes the homeowner pulling their own permit, so it is never requested. A contractor known only as a person is stored as "Independent contractor" keyed by city license number (migration 0008 scrubbed earlier rows; the M1 fixture was corrected before it was ever pushed).
33. **GitHub:** the repo already had GitHub's "Initial commit" (a one-line README); M1 was rebased on top of it and pushed as a fast-forward, so nothing was force-pushed.
35. **Lead list URL under the base path is `/leads/leads`.** Production serves the app at 216labs.dev/leads, so the in-app `/leads` route becomes `/leads/leads`. It works; renaming the in-app route is left for a later product decision.
36. **A 14th preset, `fence`,** backs the staging QA fence org and the no-key fallback for fence companies (the addendum's A5 table and A8 golden tests both use fencing).
34. **Build mode (owner's call, 2026-11-01):** PRs are merged by me once CI passes; required reviews and branch protection (D2) are switched on at launch. PRs are opened and merged through the GitHub REST API because the `gh` CLI is not installed here.
23. **Addendum A placement:** its work is milestones A1 (presets) then A2 (wizard), right after M2, per its section A9. The spec's "remaining 7 templates" moved from M11 into A1.
24. **Domain is 216labs.dev/leads** (from the addendum): copy, opt-out link, email sender and ingest UA use it. Locally the app runs at the root of localhost:3000; serving it under `/leads` in production is a base-path setting handled in M12.
25. **One new-construction category:** the addendum's `new_build` replaces the `new_construction` category added during the M2/M3 regex work, so there is a single category for new homes.
26. **No LLM key locally:** without `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` the wizard maps answers to the closest preset with keyword rules (the same path as A3's fallback), so `pnpm local` needs no paid key.

## Source status

Checked 2026-11-01 from this machine. All reachable without login.

| Source | Status |
|---|---|
| Cuyahoga parcels (FeatureServer/1) | 572,828 rows |
| CCPC canopy | 484,989 rows |
| FEMA NFHL layer 28 | reachable |
| Cleveland permits / violations / rentals / condemnations | 202,564 / 61,615 / 97,872 / 2,623 |
| Cleveland demolition / boardup / CoO / lead safe / disclosure | 11,122 / 20,556 / 12,073 / 20,466 / 93,743 |
| Cleveland 2022 survey / contractor registry | 162,675 / 3,440 |
| Lake parcels, Lake permits listing | reachable (custom UA accepted) |
| Stark sales | 304,156 rows |
| Medina permit list | reachable |
| Summit permit search | reachable |

## Stubs and gaps

- **Cloud accounts (D1):** Vercel project, Supabase `216leads-prod` / `216leads-staging`, and their env vars need the owner's accounts. `docs/ENVIRONMENTS.md` lists the exact steps.
- **Backlog issues already on GitHub (#1-#12):** handled in the matching milestones: #1 base path/URLs (D1 + PR #13), #2 opt-out page ships with postcards (M8), #3 legal pages and #7 help page (M11 marketing/legal, pulled earlier if a PR touches signup), #4 trial/past-due states and #5 founding offer (M7), #6/#10 admin tools (after M5), #8/#9 lifecycle emails (M6), #11 point-of-sale trigger (A1/M3), #12 Stripe Tax (blocked).

- **Tree category has no real Cleveland examples** (tree work does not need a building permit there); it is low-confidence per Addendum A5.
- **Records without a parcel number or matching address** (about 0.8% of Cleveland permits, mostly commercial or multi-parcel projects) stay in `unmatched_record` and show at `/admin/unmatched`.
- **Certificates of occupancy match at 86%**: many carry multi-parcel or retired parcel numbers. They are an M3 signal source only, so this is logged rather than worked around.
