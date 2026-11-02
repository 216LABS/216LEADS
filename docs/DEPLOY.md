# Deploying under 216labs.dev/homesignal

The app is one Next.js project served under the base path `/homesignal`. Every route, asset, API URL, email link and postcard link carries that prefix when `NEXT_PUBLIC_BASE_PATH=/homesignal` is set at build time. Account setup (Vercel, Supabase, Stripe, Lob, Resend, Sentry) is in `docs/ENVIRONMENTS.md`; this page is the deploy itself.

## 1. Vercel project

- Root directory `apps/web`, framework Next.js, install `pnpm install --frozen-lockfile`, build `next build`.
- Production env: everything in `.env.example` with production values, plus `APP_ENV=production`, `NEXT_PUBLIC_BASE_PATH=/homesignal`, `APP_BASE_URL=https://216labs.dev`.
- Preview env: staging values, `APP_ENV=staging`, `NEXT_PUBLIC_BASE_PATH=/homesignal`. Never production keys (Stripe and Lob refuse live keys outside production anyway).

## 2. Put it at 216labs.dev/homesignal

Pick one:

**A. 216labs.dev is another site (recommended).** In the main site's Vercel project add these rewrites, so the HomeSignal app keeps its own deploys. The `/leads` pair forwards old links (from before the #42 rename) to the app, which answers them with a 308 to the same page under `/homesignal`:

```json
{ "rewrites": [
  { "source": "/homesignal", "destination": "https://<homesignal-project>.vercel.app/homesignal" },
  { "source": "/homesignal/:path*", "destination": "https://<homesignal-project>.vercel.app/homesignal/:path*" },
  { "source": "/leads", "destination": "https://<homesignal-project>.vercel.app/leads" },
  { "source": "/leads/:path*", "destination": "https://<homesignal-project>.vercel.app/leads/:path*" }
] }
```

(If the main site would rather not forward `/leads`, it can answer `/leads/:path*` itself with a permanent redirect to `/homesignal/:path*`.)

**B. This project owns 216labs.dev.** Add the domain to this project. `/` then answers 404 (the app lives under `/homesignal`); add a redirect from `/` to `/homesignal` in Vercel if wanted.

## 3. Database

`migrate.yml` applies new migrations on merge to `main`: staging first (`STAGING_DATABASE_URL`), then production (`PRODUCTION_DATABASE_URL`, behind the `production` environment) once those secrets exist. It runs the same append-only runner as `pnpm db:migrate`. Take a backup first for risky migrations (`docs/ROLLBACK.md`). The first data load runs on the worker: `pnpm ingest pipeline cleveland` then `pnpm ingest pipeline counties`.

## 4. Webhooks and schedules

| What | URL / setting |
|---|---|
| Stripe webhook | `https://216labs.dev/homesignal/api/webhooks/stripe` (events: checkout.session.completed, customer.subscription.*, invoice.paid, invoice.payment_failed); secret -> `STRIPE_WEBHOOK_SECRET` |
| Lob webhook | `https://216labs.dev/homesignal/api/webhooks/lob`; secret -> `LOB_WEBHOOK_SECRET` |
| Cron | `schedule.yml` calls `https://216labs.dev/homesignal/api/cron/<job>` with `CRON_SECRET`, and runs the daily ingest pipeline with the production database secret |
| Supabase Auth | Site URL `https://216labs.dev/homesignal`, redirect URLs `https://216labs.dev/homesignal/**` |
| Uptime | Sentry uptime monitor on `https://216labs.dev/homesignal/api/health` (503 when daily ingest is 36+ hours stale in production) |

## 5. After every deploy

```bash
node scripts/dev/check-deploy.mjs https://216labs.dev/homesignal
```

It loads every public page, checks that an old `/leads/...` link answers 308 to `/homesignal/...`, checks that page assets come from `/homesignal/_next/...`, calls the health route and checks that a signed-out visit to the app goes to `/homesignal/login`. Then run the Playwright smoke against the deploy with `E2E_BASE_URL=https://216labs.dev/homesignal/` (use the staging preview, since it signs up test users).

## 6. Before launch

- Replace the draft legal text in `apps/web/content/legal/*.mdx` (attorney review, issue #3). `/admin` shows a red warning in production while any page is still `status: draft`.
- Switch on branch protection and required reviews (decision 34).
- Records-request PDFs need Python + pdfplumber, which Vercel lacks; import PDFs from a local machine or the worker.
