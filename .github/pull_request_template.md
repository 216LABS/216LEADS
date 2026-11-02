<!-- Title: Conventional Commit style, e.g. "feat: lead detail timeline", "fix: ...", "chore: ..." -->

Closes #

## What

<!-- What changed and why, in a few bullets. -->

## How to test on the preview

<!-- Steps a reviewer follows on this PR's preview (QA login: qa@216leads.test). -->
1.

## Test plan for risky changes

<!-- Required when this PR touches auth, Stripe, Lob sends, RLS policies or data deletion (the `risky` label). Say what could go wrong and how you checked it doesn't. Otherwise delete this section. -->

## Checklist

- [ ] CI is green (lint, unit, integration, smoke)
- [ ] No homeowner names, owner fields or customer data added anywhere (code, fixtures, logs, screenshots)
- [ ] Every query on an org-scoped table filters by the session's `org_id`; new org routes have a cross-org case in `apps/web/lib/isolation.int.test.ts`
- [ ] New schema changes are a new migration file; no merged migration edited
- [ ] Docs / PLAN.md updated if behavior or setup changed
