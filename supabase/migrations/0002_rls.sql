-- FinanceOS V1 — Row Level Security
-- Finance: full. Management: read-only all. Sales: only their own receivables (+children), nothing sensitive.

alter table public.profiles            enable row level security;
alter table public.bank_accounts        enable row level security;
alter table public.categories           enable row level security;
alter table public.payment_methods      enable row level security;
alter table public.receivables          enable row level security;
alter table public.payment_schedules    enable row level security;
alter table public.receivable_payments  enable row level security;
alter table public.payment_allocations  enable row level security;
alter table public.recurring_payables   enable row level security;
alter table public.payables             enable row level security;
alter table public.expenses             enable row level security;
alter table public.hrdc_claims          enable row level security;
alter table public.hrdc_refunds         enable row level security;
alter table public.activity_log         enable row level security;

-- ---- profiles ----
create policy profiles_self_read on public.profiles for select using (id = auth.uid());
create policy profiles_finance_read on public.profiles for select using (public.my_role() in ('finance','management'));
create policy profiles_finance_write on public.profiles for all
  using (public.my_role() = 'finance') with check (public.my_role() = 'finance');

-- ---- categories / payment_methods : readable by all authenticated, writable by finance ----
create policy cat_read on public.categories for select using (auth.uid() is not null);
create policy cat_write on public.categories for all
  using (public.my_role() = 'finance') with check (public.my_role() = 'finance');
create policy pm_read on public.payment_methods for select using (auth.uid() is not null);
create policy pm_write on public.payment_methods for all
  using (public.my_role() = 'finance') with check (public.my_role() = 'finance');

-- ---- finance/management-only tables (sales get nothing) ----
-- helper pattern: read for finance+management, write for finance
create policy bank_read on public.bank_accounts for select using (public.my_role() in ('finance','management'));
create policy bank_write on public.bank_accounts for all
  using (public.my_role() = 'finance') with check (public.my_role() = 'finance');

create policy payables_read on public.payables for select using (public.my_role() in ('finance','management'));
create policy payables_write on public.payables for all
  using (public.my_role() = 'finance') with check (public.my_role() = 'finance');

create policy recpay_read on public.recurring_payables for select using (public.my_role() in ('finance','management'));
create policy recpay_write on public.recurring_payables for all
  using (public.my_role() = 'finance') with check (public.my_role() = 'finance');

create policy expenses_read on public.expenses for select using (public.my_role() in ('finance','management'));
create policy expenses_write on public.expenses for all
  using (public.my_role() = 'finance') with check (public.my_role() = 'finance');

create policy hrdc_read on public.hrdc_claims for select using (public.my_role() in ('finance','management'));
create policy hrdc_write on public.hrdc_claims for all
  using (public.my_role() = 'finance') with check (public.my_role() = 'finance');

create policy refunds_read on public.hrdc_refunds for select using (public.my_role() in ('finance','management'));
create policy refunds_write on public.hrdc_refunds for all
  using (public.my_role() = 'finance') with check (public.my_role() = 'finance');

create policy activity_read on public.activity_log for select using (public.my_role() in ('finance','management'));
create policy activity_write on public.activity_log for insert with check (auth.uid() is not null);

-- ---- receivables & children: finance/management full read; sales only their own ----
create policy recv_read on public.receivables for select using (
  public.my_role() in ('finance','management')
  or (public.my_role() = 'sales' and sales_pic = public.my_sales_pic())
);
create policy recv_write on public.receivables for all
  using (public.my_role() = 'finance') with check (public.my_role() = 'finance');

create policy sched_read on public.payment_schedules for select using (
  public.my_role() in ('finance','management')
  or exists (
    select 1 from public.receivables r
    where r.id = receivable_id and public.my_role() = 'sales' and r.sales_pic = public.my_sales_pic()
  )
);
create policy sched_write on public.payment_schedules for all
  using (public.my_role() = 'finance') with check (public.my_role() = 'finance');

create policy pay_read on public.receivable_payments for select using (
  public.my_role() in ('finance','management')
  or exists (
    select 1 from public.receivables r
    where r.id = receivable_id and public.my_role() = 'sales' and r.sales_pic = public.my_sales_pic()
  )
);
create policy pay_write on public.receivable_payments for all
  using (public.my_role() = 'finance') with check (public.my_role() = 'finance');

create policy alloc_read on public.payment_allocations for select using (
  public.my_role() in ('finance','management')
  or exists (
    select 1 from public.receivable_payments p
    join public.receivables r on r.id = p.receivable_id
    where p.id = payment_id and public.my_role() = 'sales' and r.sales_pic = public.my_sales_pic()
  )
);
create policy alloc_write on public.payment_allocations for all
  using (public.my_role() = 'finance') with check (public.my_role() = 'finance');
