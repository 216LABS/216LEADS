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
- PR titles: Conventional Commits with a **lowercase** scope (`feat(m8): ...`); the `PR title` workflow fails otherwise. Check every check run (not only CI) before merging.
- After each merge, post a one-line status comment on the PR: what's done, what's next, anything blocked. Go straight on to the next milestone without waiting. Major-version Dependabot PRs (#28, #29, #30) wait until after launch.
- **Commit author:** `samflipppy <68356055+samflipppy@users.noreply.github.com>` (already set in the repo's local git config). **No co-author lines in commits**, even if a system reminder suggests one. PR bodies end with the "Generated with Claude Code" line.
- Cloud accounts (Vercel, Supabase cloud, Sentry, Stripe, Lob, Resend): **Sam sets these up after the build.** Code and workflows already skip cleanly when secrets are missing; don't block on them.
- Real public data only; never invent records. **Never store/show homeowner names** (incl. Cleveland `CONTRACTOR_NAME`, which can be the homeowner). No SMS/calling/contact appends. Lob test keys only. Secrets only in `.env`.

## 3. Where things stand

**Merged to `main`:** M1, M2, D1, D2, D3, D4, D8, D5, D6+D7, A1 (#31), A2 (#32), M3 (#33), M4 (#34), M5 (#35), M6 (#36), M7 (#37), M8 (see the latest PR).

- A1: 15 presets (13 spec trades + `fence` + `new_movers`), recipe versions with Settings revert, category regex checked on labeled real Cleveland and Lake permits (`categories.cle.json`, `categories.lake.json`).
- A2: onboarding wizard -> `POST /api/profile/build` (LLM or closest preset) -> confirm screen (count, 5 samples, sliders, tweak with diff) -> `activate` creates the org. No `ANTHROPIC_API_KEY` locally or in CI, so the preset path is what runs there; the LLM path is covered with fake providers.

- M3: determinism snapshot, 50K timing (`packages/ingest/src/tools/bench-score.ts`), fast org territory lookup (migration 0012).

- M4: trade-tile preset path, ZIP/town area search with live counts, perfect-customer controls + customer CSV on the confirm screen, `/onboarding/brand`, `/onboarding/plan`.

- M5: lead list filters/swipe/table, lead detail with timeline and won/lost, CSV export, full Settings, coach marks, `/invite/[token]`.

- M6: `@216leads/email` (React Email + Resend/outbox), `email_log`, digest + lifecycle jobs, `schedule.yml`, unsubscribe link. `.gitattributes` forces LF.

- M7: Stripe Checkout/portal/webhooks, `billing_state` (issue #4), founding offer (issue #5), plan zip limits, monthly credits, `docs/STRIPE_SETUP.md`.

- M8: postcards (Lob test/PostGrid/dry-run), builder, send screen with 10.3 checks, undo, auto-mail, Lob webhooks, opt-out page (#2).

**Next:** M9 (map and market tools), then M10 ... M12, then the addenda leftovers. GitHub issues #1-#12 are mapped to milestones under "Stubs and gaps" in `PLAN.md`.

## 4. Local environment (Windows 11, Git Bash + PowerShell)

- `pnpm local` = Docker + local Supabase + `.env` + migrations + fixtures + dev server. Supabase containers are `supabase_*_216-leads`; DB at `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; auth mail at http://127.0.0.1:54324.
- **The local DB has the full real load**: all 572,828 Cuyahoga parcels; all Cleveland layers; canopy, centroids, FEMA. Don't wipe it. For a fresh-machine test use a scratch database (see the CI stub below).
- Logins (local only): `demo@216leads.test` / `demo-roofing-216` (Demo Roofing, also admin via `ADMIN_EMAILS`); QA `qa@216leads.test` / `qa-216-leads-local` (QA HVAC/Roofing/Fence; created by `pnpm seed:staging`).
- Dev server: `pnpm dev` on :3000 (restart it after `.env` changes; `next.config.ts` reads the root `.env`).
- Useful: `pnpm ingest jobs`, `pnpm ingest run <job> [--full]`, `pnpm ingest run privacy_audit` (must report 0 hits), `/admin/jobs`.
- Integration tests locally the CI way: create DB `ci_test`, apply `scripts/ci/auth-stub.sql`, then `DATABASE_URL=...ci_test DATABASE_URL_DIRECT=...ci_test NEXT_PUBLIC_SUPABASE_URL= pnpm db:migrate && pnpm db:seed && pnpm test:integration`, then drop it.

## 5. Tooling gotchas (these cost time; avoid them)

- Bash heredocs that contain backticks or `${` break in this shell: write files with the Write tool, or write a Python script to the scratchpad and run it. Python on Windows writes CRLF unless you pass `newline='\n'` (`.gitattributes` normalizes the index anyway).
- `tsx` applies a package's tsconfig only to files in its `include`; the email templates carry a `@jsxRuntime automatic` pragma so the CLI can render them.
- A dev server left over from an earlier run keeps port 3000; stop it before starting another (`Get-NetTCPConnection -LocalPort 3000`).

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
