# Addendum: Dev Pipeline, Staging and Safety Nets (216 Leads)

This adds to BUILD_SPEC.md and ADDENDUM_PROFILE_WIZARD.md. It does not replace anything. Don't redo finished work. Goal: a cheap, real software-team pipeline where every change is tested on a preview before it reaches customers. Prefer free tiers; the only paid items at launch are Vercel Pro and Supabase Pro on production.

## D1. Branches and environments
- `main` is production (216labs.dev/leads). Nothing is pushed straight to main; every change is a PR.
- Every PR gets a Vercel preview deployment automatically. Previews use the **staging** env vars, never production ones.
- Environments:
  - **production**: Supabase project `216leads-prod` (Pro plan), Stripe live, Lob live, Resend live.
  - **staging**: a second Supabase project `216leads-staging` on a separate free Supabase org (Supabase can't mix plans in one org). Stripe test mode, Lob test key, Resend sandbox or a test domain. It may pause after a week idle; that's fine.
  - **local**: `supabase start` with the same migrations.
- Add `APP_ENV` = production | staging | local. When not production: show a small "STAGING" banner, block real mail sends and real charges in code even if a live key is misconfigured.
- Seed script `pnpm seed:staging` loads a small fixed set of real public parcels plus 3 test orgs (HVAC, roofing, fence) and a QA login. No customer data ever goes into staging.

## D2. CI on every PR (GitHub Actions, free minutes)
- Workflow `ci.yml` on pull_request: install, typecheck, lint, unit tests, build.
- Run migrations against a throwaway Postgres+PostGIS service container, then the integration tests (scoring, recipe validation, golden tests from A8).
- Playwright smoke test against the PR's Vercel preview URL: sign in with the QA login, run onboarding, view leads, move a lead through CRM stages, queue a postcard (test mode).
- Branch protection on main: CI must pass and the PR must be approved before merge.
- Keep runs fast (under 10 minutes) to stay inside the free Actions minutes; cache dependencies.

## D3. Error tracking and uptime (free)
- Sentry Developer plan (free: 1 user, 5k errors/month). Add `@sentry/nextjs` to the app and Sentry to the Fly.io ingest workers. Tag events with `APP_ENV` and release (git SHA). Sample down noisy client errors so one bug can't burn the monthly quota. Staging errors go to a separate Sentry environment.
- Uptime: Sentry's free plan includes 1 uptime monitor; point it at `/leads/api/health`. Add that health route (checks DB connection and last ingest run age).
- Ingest jobs: alert by email if a nightly ingest hasn't succeeded in 36 hours (write `ingest_run` rows; the health route reads them).

## D4. Database safety
- All schema changes are migration files in the repo (Supabase CLI). Never edit the prod schema by hand.
- Migrations run on staging first (on merge to main, a workflow applies them to staging, then production after staging succeeds).
- Production on Supabase Pro gets daily backups (7 days). Also add a free weekly `supabase db dump` GitHub Action that uploads an encrypted dump as a workflow artifact, as an off-site copy.
- Write `docs/ROLLBACK.md`: how to roll back the app (Vercel instant rollback) and the DB (restore a backup), and the rule that destructive migrations (drop column/table) ship in two steps: stop using it first, drop it in a later release.

## D5. Security checks (free)
- Dependabot for npm and GitHub Actions, weekly, grouped minor/patch updates.
- gitleaks step in CI to fail any PR that contains a key or secret.
- `npm audit --audit-level=high` in CI (warn, don't block, at first).
- Supabase row-level security on every table with org data; a test that a user from org A can't read org B's leads, profiles, CRM rows or mail jobs.
- Files touching auth, Stripe, Lob sends, RLS policies or data deletion get a `risky` PR label automatically (labeler action) and a written test plan in the PR description.

## D6. Usage data and feedback
- Simple product events in our own `event` table (signup, onboarding_done, lead_viewed, stage_changed, postcard_queued, checkout_started, subscribed). No third-party analytics needed at launch.
- In-app "Report a problem" link that emails support with the page URL, org id and user id, so reports can become GitHub issues.

## D7. Release notes
- Use Conventional Commit PR titles (feat:, fix:, chore:). GitHub's auto-generated release notes on each tag; a short public CHANGELOG.md page for customers later.

## D8. Repo setup for the backlog loop
- Issue templates: bug (steps, expected, actual, env, screenshot) and feature (goal, acceptance criteria, spec section).
- Labels: `ready`, `in-progress`, `needs-qa`, `blocked`, `bug`, `feature`, `p0`-`p3`, `risky`.
- Every PR body says `Closes #<issue>` and lists how to test it on the preview.
- `CONTRIBUTING.md` explains this loop for Claude Code: take the top open `ready` issue by priority, one at a time; open a PR; move the issue to `needs-qa`.

## D9. Order
Ship D1, D2, D3, D4 and D8 before the first paying customer. D5 next. D6 and D7 any time after launch.
