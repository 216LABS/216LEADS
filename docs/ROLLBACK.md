# Rollback

How to undo a bad release. Production is `main` on Vercel plus the `216leads-prod` Supabase project.

## The app (Vercel)

1. Vercel → project → **Deployments**.
2. Find the last good production deployment → **⋯ → Instant Rollback**. Traffic moves in seconds; no rebuild.
3. Revert the bad PR on GitHub (**Revert** button on the merged PR) and merge the revert PR, so `main` matches what is live. Until then, the next merge to `main` would redeploy the bad code.

Instant rollback only changes code. If the bad release also ran a migration, read the next section before rolling back the app: old code must still work with the new schema (it will if the two-step rule below was followed).

## The database (Supabase)

Prefer a **forward fix** (a new migration that corrects the problem) over a restore; a restore loses every write since the backup.

When data is lost or corrupted and a restore is needed:

1. **Point in time / daily backup (first choice).** Supabase dashboard → `216leads-prod` → Database → Backups. Pro keeps 7 daily backups. Restore the latest one before the incident. This replaces the whole database.
2. **Weekly off-site copy.** GitHub → Actions → "Weekly database backup" → the run → artifact `db-backup` (kept 30 days). Decrypt and restore into a new or empty database:
   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY \
     -in 216leads-prod-YYYYMMDD.dump.enc -out restore.dump
   pg_restore --no-owner --no-privileges --clean --if-exists -d "$TARGET_DATABASE_URL" restore.dump
   ```
   Restore into staging or a scratch project first to check it, then into production.
3. After any restore, run `pnpm db:migrate` against the restored database (it applies only what is missing) and rerun the daily pipeline (`pnpm ingest pipeline daily`) to refill public-record changes since the backup. Customer data (leads' statuses, notes, mail pieces) written after the backup is gone; tell affected customers.

## Rules that keep rollback safe

- **Every schema change is a migration file** in `packages/db/migrations`, applied by the "Migrate databases" workflow: staging first, production only after staging succeeds. Never edit the production schema by hand in the Supabase dashboard.
- **Merged migrations are never edited.** CI fails a PR that changes or deletes an existing migration; write a new one instead.
- **Destructive changes ship in two releases.** To drop a column or table:
  1. Release 1: stop reading and writing it in code (and backfill anything that replaces it). Deploy, let it run.
  2. Release 2 (a later PR): the migration that drops it.
  This way the previous app version always works with the current schema, so an instant rollback is always safe. CI warns when a new migration contains `drop column` / `drop table`.
- Data deletions (opt-outs, purges) are also migrations or jobs reviewed in a PR, never ad hoc SQL.
