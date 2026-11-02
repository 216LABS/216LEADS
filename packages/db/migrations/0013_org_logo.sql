-- Spec 9.1 step 4: the org's logo for postcards. Kept in the database (no file store on the
-- serverless host); PNG, JPEG or WebP up to 512 KB, checked by the upload route.
create table org_logo (
  org_id uuid primary key references org(id) on delete cascade,
  content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/webp')),
  data bytea not null check (octet_length(data) <= 524288),
  updated_at timestamptz not null default now()
);
alter table org_logo enable row level security;
create policy org_logo_rw on org_logo for all using (is_org_member(org_id)) with check (is_org_member(org_id));
