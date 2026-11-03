# Environments

216 HomeSignal runs in three environments. Every change reaches `main` through a pull request, and every PR gets a Vercel preview that runs against **staging**. Merging to `main` does not deploy production; production is promoted by hand in Vercel (see `docs/DEPLOY.md`).

| | production | staging | local |
|---|---|---|---|
| URL | 216labs.dev/homesignal | Vercel preview URL per PR (`.../homesignal`) | http://localhost:3000 |
| `APP_ENV` | `production` | `staging` | `local` |
| `NEXT_PUBLIC_BASE_PATH` | `/homesignal` | `/homesignal` | blank |
| Database + auth | Supabase project `216homesignal-prod` (Pro plan) | Supabase project `216homesignal-staging` (free plan, in a separate Supabase org) | `supabase start` |
| Stripe | live keys | test keys (`sk_test_`) | test keys or none |
| Lob | live key | test key (`test_`) | test key or none (dry run) |
| Resend | live domain | sandbox or test domain | none (emails go to the `email_outbox` table, shown at `/admin/outbox`; `EMAIL_OUTBOX=file` writes `.data/outbox` files) |
| Data | real public records + customers | real public records + 3 QA orgs from `pnpm seed:staging` | fixtures or a local full ingest |

Outside production the app shows a STAGING or LOCAL banner and **refuses live Stripe and Lob keys in code** (`assertKeyAllowed` in `packages/shared/src/app-env.ts`), so a misconfigured preview cannot charge a card or mail a postcard.

## One-time setup (owner)

These need the 216LABS accounts and are not done by the code:

1. **Supabase**
   - Create `216homesignal-prod` on the paid org (Pro) and `216homesignal-staging` on a separate free org (Supabase does not mix plans in one org). Staging may pause after a week idle; that is fine.
   - In each project: Authentication → URL configuration. Site URL: `https://216labs.dev/homesignal` (prod) or `https://www.216labs.dev/homesignal` (staging). Add redirect URLs `https://216labs.dev/homesignal/**` (prod) and `https://www.216labs.dev/homesignal/**` (staging).
   - Copy the API URL, anon key, service role key and the direct database URL for each into the Vercel and GitHub secrets below.
2. **Vercel**
   - Import `216LABS/216LEADS`, Root Directory `apps/web` (pnpm workspace is detected; `apps/web/vercel.json` sets the build).
   - **Production** environment variables: production values from `.env.example`, `APP_ENV=production`, `NEXT_PUBLIC_BASE_PATH=/homesignal`.
   - **Preview** environment variables: staging values, `APP_ENV=staging`, `NEXT_PUBLIC_BASE_PATH=/homesignal`. Previews must never get production keys.
   - Point `216labs.dev` at the project with a `/homesignal` rewrite, or serve the project on `216labs.dev` directly with the base path.
3. **GitHub secrets** (Settings → Secrets → Actions), used by the migration and backup workflows (milestones D2/D4): `STAGING_DATABASE_URL`, `PRODUCTION_DATABASE_URL`, `BACKUP_ENCRYPTION_KEY`. The scheduler (`schedule.yml`, M6) also needs `PRODUCTION_DATABASE_URL_DIRECT` (daily ingest), `PRODUCTION_APP_URL` + `CRON_SECRET` (hourly digest/lifecycle calls), and optionally `SENTRY_DSN`, `RESEND_API_KEY`, `ALERT_EMAILS`.
4. **Email (M6):** set `APP_BASE_URL=https://216labs.dev`, `EMAIL_LINK_SECRET` (random, 32+ chars) and `RESEND_API_KEY` in production. Resend sends only when `APP_ENV=production`; staging and local write every email to `.data/outbox`. Verify `mail.216labs.dev` in Resend with SPF, DKIM and DMARC (`p=none` first, `p=quarantine` after two clean weeks).
4. **Staging data**: with the staging env loaded, run `pnpm db:migrate` then `pnpm seed:staging` (set `QA_PASSWORD` first; the QA login is `qa@216leads.test`).

## Local

`pnpm local` (see README). `APP_ENV` defaults to `local`; `pnpm seed:staging` also works locally and prints the QA password.

## Supabase magic-link email (M6)

In each Supabase project: Authentication → Emails → Magic Link. Subject "Your 216 HomeSignal sign-in link". Body: "Tap to sign in to 216 HomeSignal: {{ .ConfirmationURL }} — the link works once and expires in an hour. If you didn't ask for it, ignore this email. 216LABS LLC, 1474 Rosewood Ave, Lakewood, OH 44107". Set SMTP to Resend (`smtp.resend.com`, user `resend`, password = `RESEND_API_KEY`) with sender `hello@mail.216labs.dev`.
