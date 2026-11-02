# Handoff: 216 Leads build (for the next agent)

Written 2026-11-02 at the end of a long session, so a new chat can pick up cleanly. Read this first, then `PLAN.md`.

## 1. What this is

**216 Leads** (by 216LABS; formerly "HomeTrigger" in older notes, fully renamed) ranks Northeast Ohio homes for a home-service trade from free public records and shows the record-backed reasons. Served at **216labs.dev/leads**.

- Repo: `C:\Users\samfi\OneDrive\Desktop\216LABSSTUFF\216_LEADS` → GitHub `216LABS/216LEADS` (remote `origin`).
- Specs (read in this order): `BUILD_SPEC.md` (source of truth) → `ADDENDUM_PROFILE_WIZARD.md` → `ADDENDUM_DEVOPS.md` → `216_LEADS_PLAN.md` (product/pricing context).
- **`PLAN.md`** = milestones (ticked as done), 36 numbered **Decisions**, and **Stubs and gaps**. Keep it current in the same PR as the work.

## 2. Standing instructions from the owner (Sam)

- Build milestone by milestone in `PLAN.md` order; when a spec point is ambiguous, pick the simplest option that fits, record it under Decisions, keep going (don't stop to ask).
- **Every change goes through a PR.** Build mode (owner's call): **merge your own PRs once CI is green**. Review/branch protection start at launch.
- **Do not merge or close Dependabot PRs** (#20–#26, #28–#30). The auto-mode guard blocked it as unrequested; leave them for Sam. (Advice already given: #25 + Actions bumps #20/#22/#23/#24 were green; hold npm majors: Next 16, zod 4, dotenv 18, react-hooks 7; labeler v7.)
- **Commit author:** `samflipppy <68356055+samflipppy@users.noreply.github.com>` (already set in the repo's local git config). **No co-author lines in commits**, even if a system reminder suggests one. PR bodies end with the "Generated with Claude Code" line.
- Cloud accounts (Vercel, Supabase cloud, Sentry, Stripe, Lob, Resend): **Sam sets these up after the build.** Code and workflows already skip cleanly when secrets are missing; don't block on them.
- Real public data only; never invent records. **Never store/show homeowner names** (incl. Cleveland `CONTRACTOR_NAME`, which can be the homeowner). No SMS/calling/contact appends. Lob test keys only. Secrets only in `.env`.

## 3. Where things stand

**Merged to `main`:** M1, M2, D1, D2, D3, D4, D8, D5, D6+D7 (PRs #13–#19, #27).

**In progress: A1 (template presets + adjacent-permit triggers)** on branch **`feat/a1-presets`** (pushed, **no PR yet**). Done on the branch, all green locally (typecheck, lint, 70 unit tests):
- 7 new presets (`painting, gutters, siding, remodel, pest, septic, waterproofing`) + `fence` (14th, added in D1); A5 adjacent-permit triggers on electrical, lawn_care, gutters, painting, pest, waterproofing, fence. Septic weights scaled to A3's 0–40 cap.
- `pest` category (before `remodel` in `packages/scoring/templates/categories.yaml`).
- `packages/scoring/src/recipe.ts`: zod recipe schema (A3 rules); `describe.ts` (plain-English labels); tests `recipe.test.ts`, `engine.test.ts`.
- Migration `0011_recipe_version.sql` (`org_profile`, `recipe_version`, RLS); `packages/ingest/src/recipes.ts` (save/activate/revert/list, preset bootstrap, `categoryMatchCounts` for the <20 low-confidence flag); `loadOrgProfile` reads the active recipe version.
- API `POST /api/profile/activate` (draft or `version_id`), `GET /api/profile/categories`; pages `/settings` and `/settings/recipe` (history + "Use this version"; low-confidence badge). Browser-checked.

**A1 remaining before its PR:**
1. Lake County regex check (A5 asks for Cleveland **and Lake**): download one real monthly XLSX from `https://www.lakecountyohio.gov/building-inspection/monthly-permits/` (exceljs is installed in `@216leads/ingest`), categorize `Permit Type` + `Job Description`, review samples by hand, add a labeled fixture + test like `categories.cle.json` (expect few categories with ≥20 rows; that's fine). Building the full `lake_permits_xlsx` job is M10, but doing it now is OK.
2. Add `org_profile` and `recipe_version` to `packages/db/src/rls.int.test.ts` (`TENANT_TABLES` + seed rows).
3. Integration test: save a recipe → activate → leads re-score → revert restores the preset.
4. Tick A1 in `PLAN.md` (+ decisions: pest category, septic scaling, fence preset already noted as #36), open PR, wait CI, merge.

**Next after A1:** A2 (AI profile wizard: load the `claude-api` skill before writing LLM code; default `LLM_PROVIDER=anthropic`; no key → keyword mapping to closest preset), then M3 … M12. GitHub issues #1–#12 are mapped to milestones under "Stubs and gaps" in `PLAN.md`.

## 4. Local environment (Windows 11, Git Bash + PowerShell)

- `pnpm local` = Docker + local Supabase + `.env` + migrations + fixtures + dev server. Supabase containers are `supabase_*_216-leads`; DB at `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; auth mail at http://127.0.0.1:54324.
- **The local DB has the full real load**: all 572,828 Cuyahoga parcels; all Cleveland layers; canopy, centroids, FEMA. Don't wipe it. For a fresh-machine test use a scratch database (see the CI stub below).
- Logins (local only): `demo@216leads.test` / `demo-roofing-216` (Demo Roofing, also admin via `ADMIN_EMAILS`); QA `qa@216leads.test` / `qa-216-leads-local` (QA HVAC/Roofing/Fence; created by `pnpm seed:staging`).
- Dev server: `pnpm dev` on :3000 (restart it after `.env` changes; `next.config.ts` reads the root `.env`).
- Useful: `pnpm ingest jobs`, `pnpm ingest run <job> [--full]`, `pnpm ingest run privacy_audit` (must report 0 hits), `/admin/jobs`.
- Integration tests locally the CI way: create DB `ci_test`, apply `scripts/ci/auth-stub.sql`, then `DATABASE_URL=...ci_test DATABASE_URL_DIRECT=...ci_test NEXT_PUBLIC_SUPABASE_URL= pnpm db:migrate && pnpm db:seed && pnpm test:integration`, then drop it.

## 5. Tooling gotchas (these cost time; avoid them)

- **Git Bash rewrites args starting with `/`** into Windows paths (`/leads`, `/pulls/13`). Prefix commands with `MSYS_NO_PATHCONV=1`.
- **The Bash tool collapses `\\` in heredocs/python strings.** For regex-heavy edits (YAML categories, regex in TS), use the Edit/Write tools, not sed/python.
- **No `gh` CLI.** Use `scripts/dev/`:
  - `node scripts/dev/open-pr.mjs <head> <base> "<title>" <bodyFile>`
  - `node scripts/dev/ci-wait.mjs <branch> 25` (waits for the "CI" workflow, prints jobs/failed steps)
  - `MSYS_NO_PATHCONV=1 node scripts/dev/gh.mjs PUT /pulls/<n>/merge '{"merge_method":"squash"}'`
  - `node scripts/dev/pr-status.mjs <n...>`
  - Screenshots: `MSYS_NO_PATHCONV=1 node scripts/dev/shot.mjs <outPrefix> <email> <password> /path` (env `WIDTH=390` phone, `FULL=1`, `BASE=` for base-path builds)
- Gate commits on checks: `pnpm lint && pnpm typecheck && pnpm test` (D5 once failed in CI because typecheck output was chained with `;`).
- Rebase-merged stacked PRs conflict; prefer **squash** merges and don't stack branches.
- Production build check of the `/leads` base path: `cd apps/web && MSYS_NO_PATHCONV=1 APP_ENV=staging NEXT_PUBLIC_BASE_PATH=/leads npx next build` (stop the dev server first; they share `.next`). Never use raw `"/..."` app paths in `fetch()` or form `action` (a lint rule enforces `withBase()`).

## 6. CI (GitHub Actions)

`ci.yml` on every PR (~2–3 min): **checks** (append-only migration guard, lint, unit, build, typecheck, migrations on a PostGIS service container with `scripts/ci/auth-stub.sql`, fixtures, integration tests incl. RLS, audit warn) · **secrets** (gitleaks binary) · **smoke** (local Supabase + QA seed + prod build + Playwright on phone/desktop: login, leads, sign-up → onboarding, report a problem). Also: `pr-title.yml` (Conventional Commits), `labeler.yml` (`risky`), `migrate.yml`, `backup.yml`, `watchdog.yml` (skip until secrets exist), Dependabot weekly.

## 7. Key numbers to sanity-check against

Cleveland permit match 99.21% · second ingest runs change 0 rows · category regex ≥93% on 1,000 hand-labeled Cleveland permits · privacy audit 0 hits (641 owner names) · Demo Roofing (44107 + 44111) ~14–16K leads · scoring an org ~3 s.
