# Contributing to 216 Leads

This repo is built mostly by Claude Code working through the GitHub issue backlog. The same loop applies to people.

## The backlog loop

1. **Pick one issue.** Take the top open issue labeled `ready`, by priority (`p0` first, then `p1`, `p2`, `p3`; oldest first within a priority). Skip `blocked`. Work on one issue at a time.
2. **Claim it.** Add the `in-progress` label and remove `ready`.
3. **Branch** from `main`: `feat/<issue>-<slug>`, `fix/<issue>-<slug>` or `chore/<slug>`.
4. **Build it** with tests (see "Checks" below). Keep the PR to what the issue asks.
5. **Open a PR** with a Conventional Commit title (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`) and the template filled in:
   - `Closes #<issue>`
   - how to test it on the PR's preview deployment (QA login `qa@216leads.test`)
   - a written test plan if the PR is labeled `risky` (auth, Stripe, Lob sends, RLS policies, data deletion)
6. **Hand off.** When CI is green, move the issue to `needs-qa` (remove `in-progress`).
7. **Merge.** During the build phase the author merges on green CI. From launch on, `main` is protected: CI must pass and the PR needs an approving review.

Milestone work from `PLAN.md` follows the same PR flow; `PLAN.md` is ticked in the same PR that finishes a milestone.

## Checks

```bash
pnpm lint
pnpm test                # unit tests
pnpm typecheck
pnpm test:integration    # needs a migrated, seeded DB (pnpm local or CI)
pnpm test:e2e            # Playwright smoke; needs the app running
```

CI (`.github/workflows/ci.yml`) runs all of these on every PR, against a throwaway Postgres + PostGIS database and a local Supabase stack.

## Rules that are never bent

- **No homeowner names** anywhere: database, fixtures, logs, emails, screenshots, issues. Owner fields are dropped at parse time; individual contractors are stored by license number only. `pnpm ingest run privacy_audit` checks this.
- **Real public data only.** No invented records; if a source is unreachable, stub it behind an interface and note it in `PLAN.md`.
- **No SMS, calling or contact appends** for homeowners.
- **Secrets live in `.env` only** (see `.env.example`). Outside production, live Stripe and Lob keys are refused in code.
- **Schema changes are new migration files** in `packages/db/migrations`. Never edit a merged migration; destructive changes ship in two releases (`docs/ROLLBACK.md`).
- Commits are authored as the repo owner's account with no co-author lines.

## Local setup

See `README.md` (`pnpm local`) and `docs/ENVIRONMENTS.md`.
