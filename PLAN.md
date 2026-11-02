# 216 Leads build plan

Source of truth: `BUILD_SPEC.md`. Product and UX context: `HOMETRIGGER_PLAN.md`.
Product name: **216 Leads** (by 216LABS).

Each milestone is finished only after it runs locally, its checks pass, it is committed, and its box below is ticked.

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
- [ ] Cleveland: violations, rentals, condemnations, demolition, boardup, 2022 survey, contractor registry
- [ ] County: canopy (CCPC), parcel centroids, FEMA flood zones
- [ ] Address matcher tiers (parcel id, exact, fuzzy, geo) + `unmatched_record` retry
- [ ] `job_run` bookkeeping, `source` table, `/admin/jobs` and `/admin/unmatched`
- Check: second run upserts 0 changed rows; at least 99% of Cleveland permits match a parcel; no owner-name strings in any table

### M3: Scoring engine complete
- [ ] Full signal library (7.2) materialized in `parcel_signal`
- [ ] Category regex (7.3) with fixture tests (at least 90% per category)
- [ ] 6 M1 templates (roofing, hvac, plumbing, electrical, lawn_care, tree) in YAML
- [ ] Triggers, hard filters, exclusions, reasons with evidence, pitch
- [ ] Incremental lead upsert; 50K parcels scored in under 5 s; determinism snapshot test

### M4: Onboarding wizard
- [ ] Step 1 trade tiles, step 2 area with live counts, step 3 perfect customer with live 5-home preview, step 4 brand, step 5 plan
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
- [ ] Remaining 7 trade templates, Summit permits (best effort)
- [ ] Marketing site: landing, pricing, sample page with masked addresses, coverage, legal

### M12: Hardening and acceptance
- [ ] RLS SQL tests, webhook signature tests, mail pre-send check tests
- [ ] Playwright: onboarding, lead list, mark won, ROI shows it
- [ ] API rate limits; README one-command run; final acceptance pass

## Decisions

1. **Repo root** is `216_LEADS/` (where the spec files live). Packages use the `@216leads/*` scope. The spec files `BUILD_SPEC.md` and `HOMETRIGGER_PLAN.md` are kept as provided (they are input documents); no product code, copy or config uses the old name.
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

(Filled in as milestones run.)
