-- A plain Postgres+PostGIS container has no Supabase `auth` schema. This adds the minimum the
-- migrations and RLS tests rely on: auth.users, auth.uid() (from the request JWT claim, as in
-- Supabase) and the anon/authenticated roles.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
