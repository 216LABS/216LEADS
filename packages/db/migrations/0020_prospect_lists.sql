-- Admin "free list" for prospects who reply to outreach (issue #6). A generated list is a
-- prospect_request row (source = admin) holding a snapshot of the homes, a share token that
-- expires after 14 days, and a view count. Signups through the link keep the token on the org.
alter table prospect_request
  alter column email drop not null,
  add column source text not null default 'public',
  add column note text,
  add column home_count int,
  add column token text unique,
  add column created_by uuid references auth.users(id) on delete set null,
  add column expires_at timestamptz,
  add column views int not null default 0,
  add column rows jsonb;

alter table org add column prospect_token text;
create index org_prospect_token_idx on org (prospect_token) where prospect_token is not null;
