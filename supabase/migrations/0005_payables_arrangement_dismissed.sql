-- Remembers when a payable was removed from the arrangement board, so the
-- "auto-add due-soon bills to KIV" logic doesn't keep re-adding it.
alter table public.payables add column if not exists arrangement_dismissed boolean not null default false;
