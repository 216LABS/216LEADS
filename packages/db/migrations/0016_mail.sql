-- M8 print and mail (spec 9.5, 10).
-- Pieces sent together share a batch (one confirmation email, one undo). Metered pieces are
-- reported to Stripe once their 15-minute cancel window has passed.
alter table mail_piece
  add column batch_id uuid,
  add column canceled_at timestamptz,
  add column metered_reported_at timestamptz,
  add column error text;
create index mail_piece_batch_idx on mail_piece (batch_id);
create index mail_piece_provider_idx on mail_piece (provider, provider_id);
create index mail_piece_meter_idx on mail_piece (send_after) where billed_via = 'metered' and metered_reported_at is null;

-- System templates (org_id null) are rendered in code from a design key kept in merge_defaults;
-- front_html/back_html hold "design:<key>". One row per trade and design.
create unique index postcard_template_system_uniq on postcard_template (trade, name) where org_id is null;

-- Follow-up sends from an auto-mail rule point back at the first piece.
alter table mail_piece add column followup_of uuid references mail_piece(id) on delete set null;
