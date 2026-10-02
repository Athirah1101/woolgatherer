-- One row per payment made against a payable, so bills paid bit by bit
-- (e.g. Joseph Chua / David Chua) keep a full payment history.
create table if not exists public.payable_payments (
  id uuid primary key default gen_random_uuid(),
  payable_id uuid not null references public.payables(id) on delete cascade,
  amount numeric(14,2) not null,
  paid_date date not null,
  payment_method_id uuid references public.payment_methods(id),
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists payable_payments_payable_idx on public.payable_payments (payable_id, paid_date);
alter table public.payable_payments enable row level security;
create policy payable_payments_read on public.payable_payments for select
  using (public.my_role() in ('finance','management'));
create policy payable_payments_write on public.payable_payments for all
  using (public.my_role() = 'finance') with check (public.my_role() = 'finance');
