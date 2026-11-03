# 216 HomeSignal build plan

Source of truth: `BUILD_SPEC.md`, plus `ADDENDUM_PROFILE_WIZARD.md` and `ADDENDUM_DEVOPS.md` (both add to the spec, replace nothing). Product and UX context: `216_LEADS_PLAN.md`.
Product name: **216 HomeSignal** (by 216LABS), served at 216labs.dev/homesignal.

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
- [x] `/homesignal/api/health` (DB connection + last ingest age) for the Sentry uptime monitor
- [x] Email alert when a nightly ingest has not succeeded in 36 hours
- Notes: Sentry stays off until `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set (account later). `ingest_run` is a view over `job_run`. The watchdog runs from `.github/workflows/watchdog.yml` via `/api/cron/ingest_watchdog` once `PRODUCTION_APP_URL` and `CRON_SECRET` secrets exist; without Resend it writes alerts to `.data/outbox`.

### D4: Database safety (DevOps addendum)
- [x] Workflow on merge to `main`: apply migrations to staging, then production after staging succeeds
- [x] Weekly encrypted `pg_dump` as a workflow artifact (off-site copy)
- [x] `docs/ROLLBACK.md` (Vercel instant rollback, backup restore, two-step destructive migrations)
- Notes: the migrate and backup workflows skip with a notice until `STAGING_DATABASE_URL`, `PRODUCTION_DATABASE_URL` and `BACKUP_ENCRYPTION_KEY` exist. Migrations stay on our runner (`packages/db/migrations`, tracked in `_migrations`) rather than the Supabase CLI's folder (decision 3). CI also fails PRs that edit a merged migration and warns on `drop column/table`.

### D8: Repo setup for the backlog loop (DevOps addendum)
- [x] Issue templates (bug, feature), labels (`ready`, `in-progress`, `needs-qa`, `blocked`, `bug`, `feature`, `p0`-`p3`, `risky`)
- [x] PR template (`Closes #<issue>`, how to test on the preview); `CONTRIBUTING.md` describing the issue -> PR -> `needs-qa` loop
- Notes: all the D8 labels already existed on the repo. Issues #1-#12 were already written in this format.

### D5: Security checks (DevOps addendum)
- [x] Dependabot (npm + Actions, weekly, grouped minor/patch); gitleaks in CI; `npm audit --audit-level=high` (warn only)
- [x] RLS test: a user from org A cannot read org B's leads, profiles, CRM rows or mail jobs
- [x] Labeler action adds `risky` to PRs touching auth, Stripe, Lob sends, RLS policies or data deletion; PR template asks for a test plan
- Notes: gitleaks runs as the open-source binary (the GitHub Action needs a paid license for org repos); full history scanned clean. The RLS test passes on both the CI Postgres (with Supabase's default grants mirrored) and real local Supabase. The `risky` labeler runs from `main`, so it applies from the next PR on. Recipe/profile tables from A1 join the RLS test when they land.

### D6 + D7: Usage events, feedback, release notes (DevOps addendum)
- [x] `event` table with product events (signup, onboarding_done, lead_viewed, stage_changed, postcard_queued, checkout_started, subscribed)
- [x] "Report a problem" link that emails support with page URL, org id and user id
- [x] Conventional Commit PR titles; `.github/release.yml` for generated release notes; `CHANGELOG.md`
- Notes: `signup` is recorded now; `onboarding_done`, `lead_viewed`, `stage_changed`, `postcard_queued`, `checkout_started` and `subscribed` are recorded by the milestones that build those flows (A2/M4, M5, M7, M8) with `track()`. A lint rule now rejects raw app paths in `fetch()` and form actions (they skip the `/leads` base path); this caught the sign-out form.

### A1: Template presets + adjacent-permit triggers (Addendum A)
- [x] All 13 trade templates (7.5) as starting presets in YAML (the 7 that were in M11 move here)
- [x] `new_build` category placed before `remodel` (A5); regexes checked against real Cleveland and Lake permit text; categories with fewer than 20 real matches flagged low-confidence in the UI
- [x] New trigger kind `permit` (same home, category, window) in the engine and template format; adjacent-permit triggers on presets per the A5 table
- [x] `org_profile` and `recipe_version` tables; scoring reads the org's active recipe version; revert to any version in Settings
- Check: every preset validates against the recipe schema; a same-home roofing permit fires the gutters preset's trigger
- Result: 14 presets (the 13 spec trades plus `fence`, decision 36) pass `recipeSchema`; the gutters preset fires on a same-home roofing permit (engine test). Lake check: 414 hand-labeled real residential permits from four 2026 monthly XLSX files (`categories.lake.json`); every Lake category with 20+ rows is at 94% or better (HVAC, electrical, plumbing, new_build, fence_deck, garage, remodel, waterproof), while roofing, demolition and windows have under 20 Lake rows. The Cleveland fixture scores are unchanged by the new rules; `recategorize` moved about 1,500 of 264K stored Cleveland events. Settings shows recipe history with "Use this version"; RLS and an integration test (save, activate, re-score, revert restores the preset's leads exactly) cover the new tables.

### A2: AI business profile wizard (Addendum A)
- [x] Wizard questions (A2) replace "pick your trade" in onboarding; territory via TerritoryPicker
- [x] Recipe builder behind `LLM_PROVIDER` (anthropic | openai); prompt in `packages/scoring/profile/prompt.md` with the signal library and categories injected from code; zod validation, one retry, then fall back to the closest preset with no user-facing error
- [x] Confirm screen: plain-English summary, live count from the scoring engine, 5 sample homes with real reasons, a slider per signal, "tweak it" with a diff
- [x] `POST /api/profile/build`, `/api/profile/tweak`, `/api/profile/activate`
- [x] Golden tests for 6 business types (roofer, HVAC, fence company, landscaper, dentist, insurance agent) per A8
- Check: a new user answers the questions, confirms the recipe and lands on scored leads
- Result: the Playwright smoke test now signs up, answers the wizard, confirms and lands on scored leads (phone and desktop). The A8 golden tests pass on the no-key path (unit) and each recipe finds leads in the Cleveland fixtures (integration); fake providers cover retry, invalid output, and provider errors (all fall back to the preset silently). The LLM call uses `claude-opus-5-5` with a cached system prompt and server-side refusal fallback. The user's explicit answers (exclusions, price limits, ticked adjacent permits) are applied after the LLM, so the model cannot override them. Extra endpoint: `POST /api/profile/preview` re-counts after a slider move without an LLM call.

### M3: Scoring engine complete
- [x] Full signal library (7.2) materialized in `parcel_signal`
- [x] Category regex (7.3) with fixture tests (at least 90% per category)
- [x] Triggers, hard filters, exclusions, reasons with evidence, pitch
- [x] Incremental lead upsert; 50K parcels scored in under 5 s; determinism snapshot test

Result: most of M3 landed during M1/M2/A1 (signal library per decision 19, Cleveland and Lake regex fixtures, all trigger kinds, filters, exclusions, evidence reasons, pitch, diff upsert). This milestone added the spec 15 determinism snapshot (20 homes x 5 presets, `packages/scoring/src/snapshot.test.ts`), a 50K in-memory timing guard, and fixed the one thing over budget: an org's territory lookup. Measured with `packages/ingest/src/tools/bench-score.ts` on the full local load, roofing org over 44107/44111/44130/44134 (61,018 homes, 21,986 leads): first run 7.1 s -> 2.6 s, incremental re-score 5.1 s -> 1.7 s.

### M4: Onboarding around the wizard
- [x] Preset path (trade tiles) for users who skip the AI questions; area step with live counts; perfect-customer controls (9.1 step 3) with live 5-home preview; brand; plan
- [x] Territories, scoring profile and current-customer CSV suppression saved

Result: "Skip the questions and pick your trade" leads to 14 trade tiles, then the area step. The area picker takes ZIPs or town names (type-ahead), and each chip shows "44107 Lakewood: N homes match", plus "Taken for roofing" when another org holds the zip exclusively. The confirm screen now has the 9.1 step 3 controls (home age, two-handle value, lot, heat, owner-occupied, rentals, condos, streets, current-customer CSV) and the top-3 "what matters most" sliders, with the preview re-counted 300 ms after each change. Confirming creates the org, then Brand (logo, phone, site, offer, postcard preview) and Plan (three cards; trial starts with no card) lead to Leads. Smoke tests cover both paths on phone and desktop.
- Check: new user signs up, picks a trade, describes their customer, lands on scored leads

### M5: CRM views
- [x] Lead list: search, filter chips, sort, mobile cards with swipe, desktop table with multi-select
- [x] Lead detail: reasons with evidence links, pitch, facts, timeline, notes, won/lost flows
- [x] CSV export (no names, 2,000 rows/day cap)
- [x] Settings: profile, territories, brand, digest, team invites, data coverage
- [x] Coach marks, empty states, bottom tab bar / sidebar

Result: Leads has a sticky filter bar (search, 5 chips, sort, status tabs with counts; all in the URL), phone cards with Contacted/Skip buttons and swipe, and a desktop table with select-all, bulk status and "Export selected". Lead detail shows evidence-linked reasons, a copyable pitch, a facts grid, a timeline of every public record plus notes, mail and status moves, a notes box, and won (job amount) / lost (reason) flows. API: `GET /api/leads`, `GET/PATCH /api/leads/:id`, `POST /api/leads/:id/notes`, `POST /api/leads/bulk`, `GET /api/leads/export.csv` (address, city, zip, score, trigger, reasons, status, disclaimer; formula-safe; 2,000 rows per ET day per org). Settings: perfect customer, recipe, area, current customers, brand, digest + return address, team invites, data coverage. Three first-visit coach marks. The smoke test now covers filter, note, won flow and CSV export on phone and desktop.

### M6: Digest and email
- [x] React Email digest + transactional templates
- [x] Email provider interface (Resend, plus a local outbox when no key)
- [x] `/api/cron/:job` with `CRON_SECRET`; job scheduler (GitHub Actions cron)

Result: new package `@216leads/email` with React Email templates: digest (top 10 leads, trigger counts, competitor of the week, one-tap links, postal footer, List-Unsubscribe; about 16 KB) and transactional (welcome, trial ending, payment failed, mail batch, auto-mail summary, team invite). `sendEmail` renders, claims an `email_log` row by dedupe key, then sends, so no message goes out twice. Jobs `digest` (each org's day from 06:00 ET, one per address per ISO week) and `lifecycle` (day-3 check-in from Sam, issue #8; trial ending, day 11) run from `/api/cron/:job` and the CLI; `schedule.yml` calls them hourly and runs the daily ingest pipeline. The welcome email is sent at onboarding and invite emails from Settings → Team. A signed one-tap unsubscribe link works without signing in.

### M7: Billing
- [x] Stripe Checkout, Customer Portal, webhooks (test mode only)
- [x] Plans, trial, zip limits per plan, monthly postcard credits

Result:
- **Stripe:** `POST /api/billing/checkout` (keeps remaining trial days, adds the metered postcard price, applies the founding coupon to Pro monthly while spots remain), `POST /api/billing/portal`, and `POST /api/webhooks/stripe` (signature-checked, idempotent via `stripe_event`).
- **Billing state (issue #4):** one pure function, `deriveBillingState`, decides `trialing / active / past_due / locked / canceled`. The webhook and the hourly lifecycle job store it, and the session derives it live. Locked or canceled accounts see a lock panel everywhere except Settings → Billing, CSV export returns 402, digests stop, and unsent postcards are canceled. One trial per email.
- **Credits:** 25 postcards when a trial adds a card; monthly plan credits (the first grant adds to the trial's).
- **Zip limits:** per plan in Settings → Your area; 3 on the trial at onboarding.
- **UI:** plan cards with a monthly/yearly toggle and the founding "n of 20 spots left" line (issue #5) on Settings → Billing and the onboarding plan step.
- **Docs:** `docs/STRIPE_SETUP.md` covers the dashboard steps.
- **Tests:** an integration test walks a full lifecycle through synthetic webhook events.

### M8: Print and mail
- [x] `MailProvider` interface; Lob (test keys only, live sends refused); PostGrid behind the same interface
- [x] 3 system postcard templates per trade, builder with live preview and proof PDF
- [x] Send flow with pre-send checks (10.3), cost preview, 15-minute cancel
- [x] Auto-mail rules with caps; webhooks; returned mail goes to suppression; credits then metered billing

Result:
- **Mail tab:** recent batches with Cancel (15 min), a builder (3 designs per trade, live front/back, proof PDF via Lob test mode, save as own template), and the auto-mail card (min score, weekly count, monthly $ cap, day-21 follow-up).
- **Mail buttons:** on lead cards, lead detail and the desktop bulk bar; they lead to the send screen (homes sending, removals per 10.3 check, credits + $0.99 metered, delivery window).
- **Opt-out (issue #2):** homeowner opt-out at `/optout`. It suppresses the address for every org at once, cancels queued pieces and hides the home from lists; Turnstile when configured; 10/IP/hour. `/admin/suppression` shows the count and the last 50.
- **After sending:** Lob webhooks (returned mail goes to suppression); metered pieces reported to the Stripe meter after their cancel window; the daily `automail` job.

### M9: Map and market tools
- [x] MapLibre map with lead pins and layers, lasso to mail
- [x] Neighbor ring, competitor tracker, heat map

Result:
- **Map tab:** score-colored pins (won jobs green), layer chips for Permits (by category), Sales, Violations, Flood zones and Heat, with a 30/90/365-day window. Tap a pin for the home (Open, Neighbor ring, Mail).
- **Lasso:** "Draw to mail" outlines a block. "Mail these N homes" shows credits plus the metered estimate, then opens the existing send screen, so every 10.3 check still applies.
- **Neighbor ring:** the 40 nearest homes within 150 m, with counts (homes, already leads, mailed in the last 30 days, opted out) and "Mail the ring". It opens from a pin, or from the new "Neighbor ring" button on lead detail (`/map?ring=<parcel>`).
- **Competitors** (`/map/competitors`): businesses pulling permits in the area, defaulting to the org's trade, with counts, categories and the 5 most recent addresses. Permits by individuals are counted but never named.
- **API:** `GET /api/map/points`, `/api/map/layer`, `/api/map/heat`, `/api/parcels/:key/neighbors`, `POST /api/parcels/:key/neighbors/mail` and `GET /api/competitors`. Logic is in `packages/ingest/src/market.ts`.
- **Tests:** `market.int.test.ts` checks the ring, competitor and heat counts against independent SQL over the fixtures (spec 15 M2 acceptance). The smoke test covers map pins, the ring and the competitors page on phone and desktop. Checked on the full local load in a `/leads` production build: map ready in about 2 s, ring query 14 ms.

### M10: More counties and exclusivity
- [x] Lake parcels + sales, Lake monthly permits XLSX, Medina permits, Stark sales
- [x] Exclusivity lock (409 "Taken") and 72-hour visibility delay

Result:
- **Jobs:** `lake_parcels`, `lake_permits_xlsx`, `stark_sales`, `medina_permits` (in `packages/ingest/src/sources/`), all in the daily pipeline; `pnpm ingest pipeline counties` does the first full load. FEMA flood now covers all four counties.
- **Local load (real data):** Lake 114,583 parcels (87,531 homes) and 27,912 permit rows from 68 monthly reports (2021-01 to 2026-07), 90.6% matched to a parcel (93.7% of residential permits); Stark 304,288 sales -> 107,588 home stubs, 225,764 sale events; Medina Oct 2026 list: 364 permits on 315 home stubs, 197 placed on the map. Privacy audit 0 hits.
- **Exclusivity:** on the Exclusive plan, Settings > Your area has "Make exclusive" on each ZIP (up to 5). Saving locks them for the org's trade in the same transaction; a ZIP another business holds returns 409 "Taken" and nothing is saved. Everyone else's new leads in a locked ZIP show 72 hours later (also never auto-mailed before then). Locks are freed when the org leaves the Exclusive plan. The area picker shows "Available" next to "Taken" on the Exclusive plan.
- **Tests:** `counties.test.ts` (parsers, owner cells never read), `exclusivity.int.test.ts` (Taken + rollback, other trades, plan cap, 72-hour delay, release).

### M11: Prove it
- [x] Attribution matcher + ROI dashboard + monthly PDF
- [x] Learned weights, violations fix list
- [x] Records-request importer (CSV/XLSX/PDF), homeowner opt-out page (opt-out shipped in M8)
- [x] Summit permits (best effort)
- [x] Marketing site: landing, pricing, sample page with masked addresses, coverage, legal

Result:
- **Attribution** (`attribution` job, after automail): a permit in the org's trade, or an arms-length sale, within 365 days after the first touch is recorded as won_self (lead marked won, or the permit names the org's business), lost_competitor (a named business) or unknown; sales are `sold`. Each new one adds a lead timeline entry.
- **ROI tab** (`/roi`, Pro): month picker, 8 metric tiles, "proof from public records" list, 12-month mailed vs won chart, PDF download (`/api/roi/pdf`, pdf-lib); `GET /api/roi?from&to`.
- **Learned weights** (`learned_weights` job, before score): spec 7.6 formula after 10 outcomes, saved as a "Learned from your wins" recipe version (A6), shown with plain sentences on Settings > Scoring recipe, with Reset.
- **Fix list** (`/fix-list`, linked from Leads): open code violations in the area in the trade's category.
- **Records importer** (`/admin/imports`): CSV/XLSX/PDF (pdfplumber), column mapping saved per city, owner-like columns can't be mapped or previewed, coverage set to `records_request`.
- **Summit permits** (`summit_permits`): walks BP{yy}##### at 1 request / 2 s; stub parcels geocoded with their ZIP. First local walk (still running at merge): BP2600001-BP2600406 gave 270 permits on 260 homes, 91% placed on the map.
- **Marketing site** (`app/(marketing)`): landing with a live 30-day sales counter, pricing, sample per trade + ZIP (masked house numbers, email-me form -> `prospect_request`), coverage per county, Terms / Privacy / Data / Refunds from `content/legal/*.mdx` (issue #3: draft note, admin warning in production, signup checkbox, `terms_acceptance`, re-accept banner), Help page from `content/help.mdx` (issue #7: nav + Settings links, support contact, reply-to and footer on every email).
- **Tests:** `prove.int.test.ts` (attribution won/lost, ROI + PDF, learned weights + reset, fix list), `imports.int.test.ts` (real permits as a records-request CSV and PDF; owner column never stored), `learned.test.ts`, Summit parser; smoke covers the terms checkbox and the Help page.

### M12: Hardening and acceptance
- [x] RLS SQL tests, webhook signature tests, mail pre-send check tests
- [x] Playwright: onboarding, lead list, mark won, ROI shows it
- [x] API rate limits; base-path deploy under 216labs.dev/homesignal; README one-command run; final acceptance pass

Result:
- **Tests:** RLS adds parcels-only-inside-the-area (`org_parcel_keys`), attribution and terms-acceptance isolation, and the new server-only tables; `apps/web/lib/webhooks.test.ts` signs real Stripe test headers (missing, wrong secret, stale, tampered body, valid); `ratelimit.test.ts`; the smoke's CRM test now ends on the ROI tab (jobs won, revenue, PDF). Pre-send checks were already in `mail.int.test.ts`.
- **Rate limits:** every signed-in API route was already 60/min per user; admin routes now are too, and the public logo (300/min/IP) and unsubscribe (30/h/IP) routes got limits. Signed webhooks, the cron secret and health stay unthrottled.
- **Deploy:** `docs/DEPLOY.md` (rewrite from 216labs.dev, env, webhooks, schedules) and `scripts/dev/check-deploy.mjs`, passing against a local `/homesignal` production build. The favicon now carries the base path (it 404'd under `/leads`).
- **Performance:** the browser Sentry SDK loads lazily and only with a DSN; Leads went from 83 to 96 on Lighthouse mobile performance (best practices 100). Text on orange uses a darker orange for WCAG AA contrast.
- **README:** one-command local run, full data loads, features, tests, deploy pointer.

Final acceptance (spec 15), checked 2026-11-02:

| Item | Status |
|---|---|
| Full ingest; second run changes 0 rows | Pass (M2, `pipeline.int.test.ts`) |
| 99% of Cleveland permits match | Pass, 99.21% |
| No owner names stored | Pass, privacy audit 0 hits (641 names, 1,151 raw files) on the full load |
| Onboarding under 3 minutes on a phone, live counts | Pass in the phone smoke (wizard and preset paths) |
| Lead detail 3+ reasons with evidence links | Pass, 98.4% of Demo Roofing's 14,617 leads have 3+, 100% have links |
| Digest in Gmail/Apple Mail; Stripe checkout/portal test mode | Rendered and tested locally; real inbox and Stripe test-mode checks need Sam's Resend/Stripe accounts |
| Lighthouse mobile 85+ on Leads | Pass, 96 |
| Lob test postcard, proof, webhook, 15-minute cancel | Pass with the dry-run provider and signed webhook tests; a live Lob test-key run needs Sam's key |
| Auto-mail caps, 30-day rule, suppression | Pass (`mail.int.test.ts`) |
| Neighbor ring and competitor counts | Pass (`market.int.test.ts`) |
| Lake, Stark, Medina jobs; exclusivity 409 + 72-hour delay | Pass (M10) |
| Attribution won_self / lost_competitor | Pass (`prove.int.test.ts`) |
| ROI PDF; importer CSV + PDF; opt-out everywhere | Pass (`prove.int.test.ts`, `imports.int.test.ts`, `mail.int.test.ts`) |

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
10. **Email** without `RESEND_API_KEY` (or outside production) goes to the `email_outbox` table instead of being sent; `/admin/outbox` shows it (issue #40). `EMAIL_OUTBOX=file` writes `.data/outbox` files for local work; serverless previews can't write to disk, so the table is the default. Ops alerts use the same sink, and staging never sends real mail even with a key. Rows are pruned after 30 days by the lifecycle job.
11. **Stripe** runs only with test keys (`sk_test_`). Without keys the app stays on the free trial and billing buttons explain that billing is not configured.
12. **Lob** runs only with test keys (`test_`); the provider throws on a live key or `LOB_ENV=live`. Without a key, a dry-run provider records pieces locally and never contacts any service.
13. **Map tiles** default to OpenFreeMap's free style (no key); `NEXT_PUBLIC_MAP_STYLE_URL` overrides it.
14. **Signals are sparse**: a missing `parcel_signal` row means 0. Signals are computed for residential parcels only. "Current year" comes from the clock, not a hard-coded 2026.
15. **Rate limits are shared through Postgres (issue #39).** `rate_limit` (unlogged, one row per key per fixed window) is incremented with one atomic upsert, so every serverless instance counts against the same total; old windows are pruned on about 1 call in 200. Fixed windows allow up to 2x the limit across a window boundary, which is fine for abuse protection. A store error lets the request through and warns Sentry. Upstash wasn't needed: the upsert is one indexed write.
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
35. **Lead list URL under the base path is `/leads/leads`.** Production serves the app at 216labs.dev/homesignal, so the in-app `/leads` route becomes `/leads/leads`. It works; renaming the in-app route is left for a later product decision.
36. **A 14th preset, `fence`,** backs the staging QA fence org and the no-key fallback for fence companies (the addendum's A5 table and A8 golden tests both use fencing).
37. **`pest` permit/violation category** (not in spec 7.3) backs the pest-control preset; it matches rodent/roach/infestation/bed bug/termite wording, mostly in city violation notices, and sits just before the catch-all `remodel` rule.
38. **Septic preset weights are scaled** from spec 7.5's 60/25/15 to 40/17/10 so they fit Addendum A3's 0-40 weight cap with the same proportions.
39. **Lake County permits: the permit type decides first.** Lake's monthly XLSX repeats the whole project's description on every trade sub-permit (an ELECTRICAL permit reads "NEW DWELLING W/ATTACHED GARAGE"), so its raw_type is `Permit Type / Use Code` and the type prefixes (HEATING/AIR CONDITIONING, HYDRONICS, REFRIGERATION, MECHANICAL -> hvac; ELECTRICAL incl. ELECTRICAL TO SEPTIC -> electrical; PLUMBING and FUEL GAS PIPING -> plumbing) lead, like Cleveland's. BUILDING permits fall through to the description rules; new rules from that review: whole-description demolition ("DEMOLITION", "GARAGE DEMO"), foundation wall/helical pier/wall brace work -> waterproof, finished basements -> remodel, patio roofs and covered patios -> fence_deck, "pool house" is not pool work. Applicant names are never read.
40. **A 15th preset, `new_movers`,** is the closest preset for businesses that aren't a home trade (dentists, insurance agents, cleaners). It weighs recent sales most heavily. The wizard's no-key path and the A8 dentist/insurance golden tests use it.
41. **`LLM_PROVIDER=openai` works** (addenda audit, 2026-11-02): an `openaiProvider` calls Chat Completions in JSON mode with `OPENAI_MODEL` (default `gpt-4.1`), behind the same validate / retry once / closest-preset path as Anthropic. Without a key for the chosen provider the wizard uses the closest preset plus keyword rules for "tweak it".
42. **The wizard creates the org.** New sign-ups have no org until they confirm the recipe; `POST /api/profile/activate` with `answers` creates the org (trade = the recipe's `preset_base`), territory, `org_profile` and the active `wizard` recipe version, scores it, and records `onboarding_done`. The TerritoryPicker is ZIP entry for now; M4 adds town search and per-ZIP live counts before the confirm screen.
43. **Org scope is resolved once per score run.** `org_territory_parcels()` tested every one of the 572K parcels against the org's territories (1.2 s, run three times per score). Migration 0012 rewrites it as one indexed join per territory kind, and `loadHomes` now reads the org's territories once and filters parcels by zip / municipality directly (polygons via `st_contains`). An integration test checks both pick the same homes.
44. **A town is added as its ZIP codes.** Typing "Lakewood" adds every ZIP with 50+ of its homes. Territories, scoring and the wizard answers stay ZIP-based, so a ZIP shared by two towns brings in both. Map tapping arrives with the map in M9.
45. **Logos live in the database** (`org_logo`, PNG/JPEG/WebP up to 512 KB, checked by magic bytes; SVG refused because it can carry script). The serverless host has no disk and Supabase Storage isn't set up; a bucket can replace the table later.
46. **Current-customer CSVs are read in the browser.** Only "street, ZIP" lines are uploaded (up to 5,000), so names, emails and phones in the user's file never reach the server. They become `org_suppression` rows, matched to a home where the address matches.
47. **The plan step starts everyone on the trial.** The three cards are shown; paying is M7's Stripe Checkout. The perfect-customer controls write the draft recipe's filters and exclusions, so they're saved as part of the first recipe version (`source = preset` for the tile path).
48. **"Mail" actions arrive with M8.** The lead card, lead detail and bulk bar get their Mail buttons with the postcard send flow; M5 ships Contacted/Skip, the status selector and CSV export.
49. **One business per account, invites by link.** An invite is for one email address, lasts 14 days, and the owner copies the link (invite emails come with the M6 email provider). Someone already in another org can't accept; seats follow `planLimits().users`. Roles are owner and member; only the owner changes area, digest and team.
50. **Exports are counted in `lead_activity`** (`kind = 'export'`, rows in `data`), so the 2,000-row daily cap needs no new table. Cells starting with = + - @ get a leading apostrophe so spreadsheets don't run them.
51. **Customer email goes out only from production.** `emailFromEnv()` uses Resend when `APP_ENV=production` and a key is set; staging and local write .html + .txt to `.data/outbox` (D1: real sends blocked outside production). Supabase Auth sends its own magic-link email; its template is set in the Supabase dashboard (copy in `docs/ENVIRONMENTS.md`).
52. **One digest per address, idempotent jobs.** The digest goes to each address separately so each gets its own unsubscribe link; `email_log.dedupe_key` (`digest:<org>:<ISO week>:<address>`) makes hourly runs safe. An empty recipient list means the owners. The subject names who the home needs ("37 homes need a roofer in Lakewood this week") rather than the spec's literal "need a {trade}".
53. **Scheduler is `.github/workflows/schedule.yml`.** It runs the daily ingest pipeline at 09:30 UTC with the production DB secret, and calls `/api/cron/digest` and `/api/cron/lifecycle` hourly. Each job skips with a notice until its secrets exist.
55. **Day-3 check-in (issue #8)** is part of the `lifecycle` job, not a separate table: `email_log` (dedupe key `trial_day3:<user>`) is the "sends at most once" record the issue asks for, and `email_optout` holds lifecycle unsubscribes. We store no first names, so it opens "hey there". Orgs with no homes are listed in the job run's meta (`day3_no_homes`) instead of being emailed. The admin preview route comes with the admin tools (issues #6/#10).
54. **Line endings:** `.gitattributes` forces LF in the repo. Windows tools had committed some files with CRLF in M4/M5; this PR renormalized them, so its diff touches those files without changing their content.
56. **`billing_state` is stored and derived.** `deriveBillingState` (shared, unit-tested for every transition) is the single rule. The column is what jobs filter on (digest, lifecycle); the session recomputes it per request so a trial that ended a minute ago is already locked in the UI. The webhook and the hourly `lifecycle` job keep the column current.
57. **Checkout during the trial keeps the trial.** Checkout sets `trial_end` to the org's `trial_ends_at` when it's 49+ hours away (Stripe's minimum), so subscribing on day 2 doesn't cut the free days short. The 25 trial postcards are granted at `checkout.session.completed` and kept when the first month's credits arrive.
58. **Credits reset monthly, annual plans included.** The lifecycle job grants plan credits to active paid orgs once every 30 days (`usage_ledger` `credit_grant`); credits don't roll over. Exclusive-plan zip locks are M10.
59. **The founding coupon is Pro monthly only.** Issue #5 leaves annual open; the PR asks Sam.
60. **Pieces go to the provider at send time with `send_date` = now + 15 min.** No separate dispatcher: undo cancels at the provider (Lob DELETE) and refunds the credit. A batch is capped at 500 homes per request.
61. **Postcards are rendered in our code** (front/back HTML per home: headline personalized with street and year built, QR to the org's site with UTM tags) and sent as finished HTML, not provider merge templates. System templates are rows with `org_id` null and a design key; an org's saved templates keep their own fields. The logo reaches the printer through a signed public URL.
62. **PostGrid is wired but not exercised** against its API in this build; its webhooks aren't accepted yet. Lob is the provider when `LOB_API_KEY` is set (`MAIL_PROVIDER=postgrid` switches); with neither, the dry-run provider records pieces and sends nothing.
63. **Metered postcards need a card on file.** On the trial (no card) only credits can be spent; homes beyond them show as "no credits left and no card on file". The auto-mail monthly cap counts metered price only.
64. **Auto-mail follow-ups skip the 30-day rule on purpose** (they're the same campaign). Auto-mail never mails a lead before it is visible (exclusivity delay) or for a locked/canceled account.
65. **Map layers load once for the whole area.** Pins (top 5,000 by score), record layers (2,000 newest) and heat cells are fetched for the org's territory, not per viewport, so panning sends no requests and stays under the 60 req/min API limit. The bbox parameters still work for API callers.
66. **Map, ring, competitors and heat are Pro features** (spec 11): `PLANS[*].marketTools`; the trial has them. Starter sees an upgrade card, and the APIs return 403.
67. **Market data stays inside the org's area,** heat and record layers included (decision 4). Only FEMA flood polygons, which carry no parcel data, are fetched by bbox.
68. **Neighbor ring = the 40 nearest residential homes within 150 m in the org's area.** The center must be in the area too. Any lead can open a ring; won jobs are highlighted. "Mail the ring" goes through the normal send screen with parcel keys; `POST /api/parcels/:key/neighbors/mail` runs the same flow for API use (a shared `sendHomes` in `apps/web/lib/send.ts`).
69. **The lasso picks open leads only** (not won jobs), at most 500 (the send cap). The selection reaches the send screen through sessionStorage because 500 ids don't fit in a URL.
70. **The competitor tracker defaults to the org's trade category** ("All permits" is one tap away) and lists businesses only; permits by individual license holders are counted in one line, never named (decision 32).
71. **MapLibre 6's worker is emitted by webpack** (`new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url)` + `setWorkerUrl`), so it is served under the base path and follows Dependabot bumps. If the basemap style can't load, the map falls back to a plain background and pins still work.
72. **The map fits the 1st-99th percentile of the area's homes.** A few county parcel points sit miles from their ZIP and made the raw extent about 4 times too wide.
73. **Lake parcels refresh weekly, sales daily.** The layer has no update stamp, so the daily delta is parcels with a sale in the last 21 days; a full refresh runs when the last one is 7+ days old. Sale dates are midnight-UTC epochs, read as UTC (reading them as ET put every sale a day early).
74. **Lake town names are normalized** (uppercase, hyphens to spaces, trailing CITY/VILLAGE dropped, TOWNSHIP kept) so the parcel layer's "Mentor-on-the-Lake City" and the report's "Mentor on the Lake" are one town, while Painesville City and Painesville Township stay apart.
75. **Lake permit reports are read by header name.** Column order changes between years (2021, 2022, 2024 and 2026 layouts differ). Jan and Mar 2023 have no Issued Date column; their rows are skipped and counted (decision 30). Each file's SHA-256 is kept in the source cursor so a file is processed once; `--full` re-reads all. Applicant Name is never read; DBA "OWNER" is not a contractor.
76. **Lake permits without a parcel number match by address within the town.** The report has no ZIP; parcel "0" is a placeholder. Such rows take the ZIP of the single Lake home at that street address in the same town, then go through normal matching.
77. **Towns in a Lake report get permit coverage** (`permits_source = lake_permits_xlsx`). County Building Inspection doesn't serve every Lake city (Mentor, Eastlake, Willoughby run their own), so those towns stay "no permit data" and use the population average (decision 18).
78. **Medina stubs are geocoded by postal city when the township name fails.** The list gives a township ("SHARON"), which the Census geocoder can't place. Unplaced rows are tried against that township's usual postal cities, then all of Medina County's; a point counts only if every city that matches puts it in the same spot inside the county box. Placed stubs keep their point; unplaced ones (mostly brand-new streets the Census doesn't know yet) are retried the next time the list changes, and have no ZIP until then, so they sit outside every ZIP territory. The job does nothing until the list's date range changes (`--full` forces a pass).
83. **Attribution counts from the first touch** (contacted, mailed or any status change sets `first_touch_at`) for 365 days. "Won by you" needs the lead marked won or the permit naming a business whose normalized name equals the org's name; we don't know a business's license otherwise. A user-confirmed attribution is never overwritten.
84. **ROI is a Pro feature** like the map (spec 11 lists it under Pro; the trial has it). Cost = plan price for the days in range (annual / 12 for yearly plans) plus metered postcard cost; ROI shows "–" while there's no cost (trial).
85. **Learned weights become recipe versions (Addendum A6).** Each night the factors are measured against the base recipe, the last version a person chose, never a feedback one, and saved as a new active `recipe_version` with `source = feedback` (base weights times the factors, whole numbers in 0-40) only when the weights change. No nudge left means the base is re-activated; Reset re-activates the base and learns only from outcomes after `learned_since`. The engine's own learned multiplier stays empty; `scoring_profile.learned_meta` keeps the won/lost averages for the Settings explanation.
86. **Fix list = active violations whose category is the trade's** (`TRADE_CATEGORY`, fence -> fence_deck), residential, in the area, minus opted-out homes. Trades with no category (new movers) get an explanation instead.
87. **Records importer reads only mapped columns.** Headers naming an owner, applicant, taxpayer, occupant, buyer or seller can't be mapped and are masked in the preview. Rows without a date are skipped and counted; the record id is the permit-number column, else a hash of date/address/type/description, so re-importing a file changes nothing. Rows without a ZIP take the ZIP of the one home at that address in the town. PDF needs Python with pdfplumber, which a serverless host lacks: there the importer says to convert to CSV (or run it locally).
88. **Summit stubs come from the permit page only** (address with ZIP, parcel number); the owner and applicant blocks are never cut out of the page. The walk restarts at 00001 each new year and stops after 50 misses, so a source that stopped publishing (GovWell move) just ends the run.
89. **Legal and help text is Markdown in `.mdx` files**, rendered by our own small renderer (headings, paragraphs, lists, bold, links), not MDX/JSX, so editing text can't run code. Acceptance is recorded when the org is created (signup requires the checkbox); members and existing users get the one-time banner. The hero counter is single-family sales in the last 30 days (spec says "this month", which reads 0 on the 1st).
90. **Rate limits cover every route a person calls** (decision 15 for the store); machine callers authenticate instead (Stripe/Lob signatures, `CRON_SECRET`).
91. **Browser Sentry is lazy.** With no DSN the SDK isn't loaded at all; with one, it loads on idle after the page is interactive. Errors in the first second of a page load can be missed; the server SDK still reports server errors.
92. **Accessible orange.** `signal-600` is #C2410C (5.2:1 on white) for text, primary buttons and 80+ score chips; the brand #F26B1D stays on the logo, progress bars and decoration.
93. **Renamed 216 Leads to 216 HomeSignal (2026-11-02, issue #42).** Flip renamed the product: every product-facing string says 216 HomeSignal ("216 HomeSignal by 216LABS"), the app is served at 216labs.dev/homesignal, and old `/leads` and `/leads/*` links answer 308 to the same path under `/homesignal` (a `next.config` redirect outside the base path; the main site forwards `/leads` too, see `docs/DEPLOY.md`). Unchanged on purpose: the GitHub repo, database tables, the `lead` model, the in-app `/leads` lead-list route (now `/homesignal/leads`), the `@216leads/*` package scope, the local QA logins (`*@216leads.test`) and comments inside already-applied migrations (they are append-only). The CI smoke now builds and tests under `/homesignal`.
94. **Tenant isolation is enforced in app queries and tested at the API (issue #38).** `apps/web/lib/isolation.int.test.ts` calls the real route handlers as org A with org B's ids (leads, notes, bulk, CSV export, mail send/cancel, recipe versions, neighbor ring, settings) and checks 404/403 and an unchanged snapshot of org B; removing one `org_id` filter makes it fail. Routes that take lists now answer 404 when none of the ids are the caller's, and cancelling another org's postcard is a 404 (was a 409). Running app queries as a non-privileged role so RLS applies too was considered and left for later: it means a second connection pool with `request.jwt.claims` per request, and the API tests cover the same risk today.
95. **Point-of-sale inspection signal (issues #11, #41).** `pos_city_sale` is 1 when an arms-length sale ($10K+) in the last 90 days is in one of the 25 ACAR report cities (`packages/scoring/templates/pos_cities.yaml`, Feb 2025, Table 1), with the reason "Sold in {city}, which requires a point-of-sale inspection". Weight 5 in the roofing, plumbing, electrical and gutters YAML and the new 16th preset `concrete` (Concrete and masonry, built from the A5 adjacent-permit row); never HVAC. Outside those towns the signal is left out rather than scored 0, so nobody else's score moves (the determinism snapshot is unchanged). City names are checked against `__fixtures__/municipalities.json` (names from the real parcel data). Twinsburg (city) and Macedonia run their own building departments, so Summit's permit list never reaches their homes; they're listed with `in_data: false`. On the full load, 187 roofing homes in 44118 carry the reason; none in Lakewood.
96. **Admin free lists (issue #6).** `/admin/prospect-lists` builds a list for a named prospect from current preset scores (top N per ZIP, up to 3 ZIPs and 50 per ZIP), minus opted-out homes, with only public facts (address, town, score, top 2 reasons, year built, last sale). The rows are snapshotted on the `prospect_request` row (`source = admin`) so the shared link shows exactly what was sent. `/l/{token}` is public, `noindex`, counts views, and after 14 days shows "this list expired" with the trial CTA. The CTA opens signup with `next=/onboarding?trade=&zips=&ref=`, the wizard starts on the trade-tile path with those filled in, and activation stores the token on `org.prospect_token`, which drives "converted" in the admin list and a note on `/admin/orgs`. "Expire (test)" exists only outside production.
97. **Monthly summary (issue #9) rides the hourly lifecycle job.** On the 1st from 9:00 AM ET, owners of orgs in `active` billing state get "your {Month} with 216 HomeSignal": new homes in the area, homes contacted, postcards mailed and delivered, jobs won and revenue entered, credits left (only for orgs that mailed), and today's top 3 homes. Lines at zero are left out. Send-once is the existing `email_log` dedupe key `monthly_summary_{yyyy_mm}:{org}:{email}` rather than a separate `lifecycle_email_send` table; lifecycle unsubscribes cover it. `pnpm ingest run monthly_summary --full` sends last month's now; `/api/admin/monthly-summary?org=&month=` previews any org and month (linked from `/admin/orgs`).
98. **Business metrics come from our own tables (issue #10).** `/admin/metrics`: MRR (paid plans in `active` or `past_due`, annual / 12, founding Pro at $149, the only discount we know of), counts per plan, founding spots used of 20, active trials, trial-to-paid (trials that ended in the last 30/90 days and are now on a paid plan), logo churn (canceled in 30 days over paying plus churned), postcards this month with revenue (`price_cents`) against provider cost (`cost_cents`), and cost per customer from an admin-entered monthly figure. `metrics_daily` is written by the hourly lifecycle job (idempotent per ET date) for the MRR and active-org lines. At risk = paying orgs past due, or with no app visit (`org.last_seen_at`, refreshed at most hourly), no event and no lead status change in 14 days, or (only when `RESEND_WEBHOOK_SECRET` turns on open tracking via `/api/webhooks/resend`) 3 digests in a row unopened; thresholds live in `admin_setting`. JSON at `/api/admin/metrics` and two CSVs take an admin session or a bearer `METRICS_READ_TOKEN`. `org.canceled_at` is new (set by the Stripe webhook), so churn counts start from this release. The ROI tab now counts what the customer paid for postcards (`price_cents`); it had been summing our provider cost (`cost_cents`).
99. **Rebrand leftovers (issue #1), read through the #42 rename.** The postcard's printed opt-out address is built from `APP_BASE_URL` + the base path (`216labs.dev/homesignal/optout` in production, the preview host on previews), falling back to the brand domain. Stripe success/cancel/portal URLs already used `APP_BASE_URL`; magic links return through the page origin + base path. `brand-guard.test.ts` fails the unit suite if "hometrigger" or the old product name appears under `apps/` or `packages/` (applied migrations and the allowed internal identifiers excepted).
100. **UI/UX pass, part (a) (issue #59).** Design rules now in code: theme tokens only (status colors `contacted` / `quoted`, `warn`, and map paint colors in `lib/theme.ts`; no hex in `app/` or `components/` outside the logo), two weights in app screens (400 and 600; the score chip, logo and print previews keep theirs), a 12/14/16/20/28/40 type scale (`text-title` for page titles and metric values), `slate` darkened to #434b59 so body copy is 8:1 on paper. The leads list leads with "Your top 5 this week" and the screen's one orange button, "Mail these 5"; phone cards get a full-width 48 px Mail (navy, so orange stays unique) plus 48 px Contacted / Skip, with swipe kept as a shortcut; the desktop table gets Built and Value columns and visible Mail / Contacted actions. Copy: Needs a fix, Mail the neighbors, Results, How we score, Homes you want; Settings grouped into Your leads, Postcards, Account. The phone header's height is a CSS variable (`--app-header-h`), so sticky bars no longer hard-code 49 px. `.tap` moved into the components layer so utilities can raise it.
82. **Medina sub-permits.** Electrical and HVAC permits reuse the building permit's number and leave the PPN blank. They're stored as `<permit>:<section>`, take the PPN of the same permit or address in the list, and otherwise join the stub already at that address in that town, or get an address-keyed stub (`medina:A<hash>`). The electrical contractor is kept (in the description or as the contractor) only when it's a business name; a person's name is never stored, including in the raw page store.
79. **Stark stubs only for numbered land-and-building sales.** The sales layer has no land-use code; vacant land (`1+LAND`) and unaddressed lots aren't homes and would otherwise score as limited-data homes. Events are keyed `PARID:CONVEYANCE_NUMBER` (one conveyance covers several parcels). Arms-length = `ARMS_LENGTH = 'Yes'` and $10,000+ (decision 20).
80. **One source failing doesn't stop the daily run.** `pipeline daily` runs every job, then fails at the end naming the ones that broke, so a Medina or Census outage still lets matching and scoring run.
81. **Exclusive ZIPs are chosen, not implied.** The Exclusive plan covers 10 ZIPs, 5 of them exclusive, so the owner marks which ones; saving the area without the Exclusive plan releases any locks. A Stripe subscription change to any other plan also releases them.
34. **Build mode (owner's call, 2026-11-01):** PRs are merged by me once CI passes; required reviews and branch protection (D2) are switched on at launch. PRs are opened and merged through the GitHub REST API because the `gh` CLI is not installed here.
23. **Addendum A placement:** its work is milestones A1 (presets) then A2 (wizard), right after M2, per its section A9. The spec's "remaining 7 templates" moved from M11 into A1.
24. **Domain is 216labs.dev/homesignal** (from the addendum): copy, opt-out link, email sender and ingest UA use it. Locally the app runs at the root of localhost:3000; serving it under `/leads` in production is a base-path setting handled in M12.
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

- **Addenda audit (2026-11-02, after M12):** every A1-A9 and D1-D9 item checked against the code. Fixed in the addenda PR: A6 feedback nudges now write `recipe_version` rows; A3 `LLM_PROVIDER=openai` is implemented. Not code: D2 branch protection waits for launch (decision 34), D2/D3 preview-URL smoke and Sentry need Sam's Vercel/Sentry accounts (CI runs the smoke against a local production build meanwhile).

- **Cloud accounts (D1):** Vercel project, Supabase `216homesignal-prod` / `216homesignal-staging`, and their env vars need the owner's accounts. `docs/ENVIRONMENTS.md` lists the exact steps.
- **Records-request PDF in production:** needs Python + pdfplumber on the host; Vercel has neither, so PDF import runs locally or on the worker (CSV/XLSX work everywhere).
- **Legal text is a draft** (issue #3): attorney-reviewed text replaces `content/legal/*.mdx` before launch; /admin warns in production until then.
- **Backlog issues already on GitHub (#1-#12):** handled in the matching milestones: #1 base path/URLs (D1 + PR #13), #2 opt-out page ships with postcards (M8, done), #3 legal pages and #7 help page (M11, done), #4 trial/past-due states and #5 founding offer (M7, done), #8 day-3 check-in (M6, done), #6/#10 admin tools (after M5), #8/#9 lifecycle emails (M6), #11 point-of-sale trigger (was listed under A1/M3 but not built, caught by #41; built in its own PR, decision 95), #12 Stripe Tax (blocked).

- **Tree category has no real Cleveland examples** (tree work does not need a building permit there); it is low-confidence per Addendum A5.
- **Records without a parcel number or matching address** (about 0.8% of Cleveland permits, mostly commercial or multi-parcel projects) stay in `unmatched_record` and show at `/admin/unmatched`.
- **Medina has no parcel layer** (checked again 2026-11-02): homes exist only once they have a permit, and have no year built, value or sale. Stark homes likewise have only sales (no year built or size).
- **Certificates of occupancy match at 86%**: many carry multi-parcel or retired parcel numbers. They are an M3 signal source only, so this is logged rather than worked around.
