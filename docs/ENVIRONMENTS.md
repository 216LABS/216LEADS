# Environments

216 Leads runs in three environments. `main` is production; every change reaches it through a pull request, and every PR gets a Vercel preview that runs against **staging**.

| | production | staging | local |
|---|---|---|---|
| URL | 216labs.dev/leads | Vercel preview URL per PR (`.../leads`) | http://localhost:3000 |
| `APP_ENV` | `production` | `staging` | `local` |
| `NEXT_PUBLIC_BASE_PATH` | `/leads` | `/leads` | blank |
| Database + auth | Supabase project `216leads-prod` (Pro plan) | Supabase project `216leads-staging` (free plan, in a separate Supabase org) | `supabase start` |
| Stripe | live keys | test keys (`sk_test_`) | test keys or none |
| Lob | live key | test key (`test_`) | test key or none (dry run) |
| Resend | live domain | sandbox or test domain | none (emails go to `.data/outbox`) |
| Data | real public records + customers | real public records + 3 QA orgs from `pnpm seed:staging` | fixtures or a local full ingest |

Outside production the app shows a STAGING or LOCAL banner and **refuses live Stripe and Lob keys in code** (`assertKeyAllowed` in `packages/shared/src/app-env.ts`), so a misconfigured preview cannot charge a card or mail a postcard.

## One-time setup (owner)

These need the 216LABS accounts and are not done by the code:

1. **Supabase**
   - Create `216leads-prod` on the paid org (Pro) and `216leads-staging` on a separate free org (Supabase does not mix plans in one org). Staging may pause after a week idle; that is fine.
   - In each project: Authentication → URL configuration. Site URL: `https://216labs.dev/leads` (prod) or the staging preview domain. Add redirect URLs `https://216labs.dev/leads/**` (prod) and `https://*-216labs.vercel.app/leads/**` (staging previews).
   - Copy the API URL, anon key, service role key and the direct database URL for each into the Vercel and GitHub secrets below.
2. **Vercel**
   - Import `216LABS/216LEADS`, Root Directory `apps/web` (pnpm workspace is detected; `apps/web/vercel.json` sets the build).
   - **Production** environment variables: production values from `.env.example`, `APP_ENV=production`, `NEXT_PUBLIC_BASE_PATH=/leads`.
   - **Preview** environment variables: staging values, `APP_ENV=staging`, `NEXT_PUBLIC_BASE_PATH=/leads`. Previews must never get production keys.
   - Point `216labs.dev` at the project with a `/leads` rewrite, or serve the project on `216labs.dev` directly with the base path.
3. **GitHub secrets** (Settings → Secrets → Actions), used by the migration and backup workflows (milestones D2/D4): `STAGING_DATABASE_URL`, `PRODUCTION_DATABASE_URL`, `BACKUP_ENCRYPTION_KEY`.
4. **Staging data**: with the staging env loaded, run `pnpm db:migrate` then `pnpm seed:staging` (set `QA_PASSWORD` first; the QA login is `qa@216leads.test`).

## Local

`pnpm local` (see README). `APP_ENV` defaults to `local`; `pnpm seed:staging` also works locally and prints the QA password.
