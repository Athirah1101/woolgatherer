-- "Possibly Stopped" is a LABEL on top of a payable's normal status, not a
-- status of its own: a bill that looks discontinued (e.g. an unused
-- subscription) stays Unpaid — counted in totals and shown on the pay list —
-- but is flagged so someone can verify whether it's still needed.
alter table public.payables add column if not exists possibly_stopped boolean not null default false;
