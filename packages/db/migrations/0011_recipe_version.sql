-- Addendum A6: the wizard's answers and every version of an org's scoring recipe.
-- The scoring engine reads the active version; with none, it uses the org's trade preset.

create table org_profile (
  org_id uuid primary key references org(id) on delete cascade,
  answers jsonb not null,                 -- wizard answers (A2); never parcel data
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type recipe_source as enum ('wizard', 'tweak', 'slider', 'feedback', 'preset');

create table recipe_version (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references org(id) on delete cascade,
  recipe jsonb not null,                  -- spec 7.4 template format, validated by recipeSchema
  multipliers jsonb not null default '{}'::jsonb, -- per-signal user multiplier m (spec 7.1)
  source recipe_source not null,
  parent_id uuid references recipe_version(id) on delete set null,
  note text,                              -- e.g. the "tweak it" instruction
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  active boolean not null default false
);
create index recipe_version_org_idx on recipe_version (org_id, created_at desc);
create unique index recipe_version_one_active on recipe_version (org_id) where active;

do $$
declare t text;
begin
  foreach t in array array['org_profile', 'recipe_version']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all using (is_org_member(org_id)) with check (is_org_member(org_id))', t || '_rw', t);
  end loop;
end $$;
