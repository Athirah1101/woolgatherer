-- Add a "possibly_stopped" payable status: a bill that looks discontinued
-- (e.g. an unused subscription) and needs verifying before it's cancelled or
-- resumed. It is excluded from "owing" totals while flagged.
alter table public.payables drop constraint if exists payables_status_check;
alter table public.payables add constraint payables_status_check
  check (status = any (array['unpaid'::text, 'partially_paid'::text, 'paid'::text, 'cancelled'::text, 'possibly_stopped'::text]));
