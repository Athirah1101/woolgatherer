-- Optional manually-entered paid date for a receivable instalment. Purely
-- informational: when set, it's shown as the "Paid" date for that month. When
-- left blank, the app falls back to the date derived from recorded payments.
alter table public.payment_schedules add column if not exists paid_date date;
