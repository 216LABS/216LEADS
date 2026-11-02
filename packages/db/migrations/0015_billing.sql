-- M7 billing (spec 11, issues #4 and #5).
-- billing_state is the one answer to "what may this org do": trialing | active | past_due | locked | canceled.
-- It is derived in code (deriveBillingState) from the Stripe subscription plus trial_ends_at, written by
-- the webhook and refreshed hourly by the lifecycle job for time-based moves (trial end, grace end).
alter table org
  add column billing_state text not null default 'trialing'
    check (billing_state in ('trialing', 'active', 'past_due', 'locked', 'canceled')),
  add column stripe_subscription_id text,
  add column period_end timestamptz,          -- current paid period; a canceled plan works until then
  add column cancel_reason text,              -- Stripe cancellation_details (feedback or reason)
  add column founding_member boolean not null default false;

-- Existing orgs: the same rules as deriveBillingState for orgs without a Stripe subscription.
update org set billing_state = case
  when plan = 'canceled' then 'canceled'
  when plan in ('starter', 'pro', 'exclusive') then 'active'
  when trial_ends_at > now() then 'trialing'
  else 'locked' end;

-- Every Stripe webhook event we processed, so a retried delivery is a no-op.
create table stripe_event (
  id text primary key,
  type text not null,
  org_id uuid references org(id) on delete set null,
  received_at timestamptz not null default now()
);
alter table stripe_event enable row level security;

-- One free trial per billing email (issue #4): a second org for the same address starts locked.
create table trial_claim (
  email citext primary key,
  org_id uuid references org(id) on delete set null,
  claimed_at timestamptz not null default now()
);
alter table trial_claim enable row level security;
