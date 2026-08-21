-- FinanceOS V1 — schema
-- Money: numeric(14,2). Business deadlines: date (date-only, no tz drift).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Profiles & roles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'sales' check (role in ('finance','sales','management')),
  sales_pic   text,                 -- name used to match receivables.sales_pic for sales users
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- role helpers (SECURITY DEFINER so RLS policies can read profiles without recursion)
create or replace function public.my_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.my_sales_pic() returns text
  language sql stable security definer set search_path = public as $$
  select sales_pic from public.profiles where id = auth.uid();
$$;

-- auto-create a profile when an auth user is created
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, sales_pic)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'sales'),
    new.raw_user_meta_data->>'sales_pic'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table if not exists public.bank_accounts (
  id             uuid primary key default gen_random_uuid(),
  account_name   text not null,
  bank           text,
  current_balance numeric(14,2) not null default 0,
  balance_as_of  date,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null default 'expense' check (kind in ('expense','payable')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_methods (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Receivables: deal -> schedule -> payment -> allocation
-- ---------------------------------------------------------------------------
create table if not exists public.receivables (
  id                uuid primary key default gen_random_uuid(),
  client_name       text not null,
  contact_name      text,
  product           text,
  sales_pic         text,
  deal_date         date,
  original_amount   numeric(14,2) not null default 0,
  total_receivable  numeric(14,2) not null default 0,
  currency          text not null default 'MYR',
  payment_plan_type text not null default 'custom',
  hrdc_applicable   boolean not null default false,
  status            text not null default 'active' check (status in ('active','completed','cancelled')),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id)
);
create index if not exists idx_receivables_sales_pic on public.receivables(sales_pic);

create table if not exists public.payment_schedules (
  id              uuid primary key default gen_random_uuid(),
  receivable_id   uuid not null references public.receivables(id) on delete cascade,
  due_date        date not null,
  expected_amount numeric(14,2) not null default 0,
  sort_order      int not null default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_schedules_receivable on public.payment_schedules(receivable_id);

create table if not exists public.receivable_payments (
  id                uuid primary key default gen_random_uuid(),
  receivable_id     uuid not null references public.receivables(id) on delete cascade,
  amount            numeric(14,2) not null,
  received_date     date not null,
  payment_method_id uuid references public.payment_methods(id),
  reference         text,
  notes             text,
  voided            boolean not null default false,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id)
);
create index if not exists idx_payments_receivable on public.receivable_payments(receivable_id);

create table if not exists public.payment_allocations (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references public.receivable_payments(id) on delete cascade,
  schedule_id uuid references public.payment_schedules(id) on delete set null,
  amount      numeric(14,2) not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_alloc_payment on public.payment_allocations(payment_id);
create index if not exists idx_alloc_schedule on public.payment_allocations(schedule_id);

-- ---------------------------------------------------------------------------
-- Payables & recurring rules
-- ---------------------------------------------------------------------------
create table if not exists public.recurring_payables (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  payee             text,
  category_id       uuid references public.categories(id),
  frequency         text not null default 'monthly' check (frequency in ('monthly','quarterly','yearly')),
  due_day           int not null default 1 check (due_day between 1 and 31),
  default_amount    numeric(14,2) not null default 0,
  amount_type       text not null default 'fixed' check (amount_type in ('fixed','variable')),
  payment_method_id uuid references public.payment_methods(id),
  start_date        date not null,
  end_date          date,
  active            boolean not null default true,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.payables (
  id                uuid primary key default gen_random_uuid(),
  payee             text not null,
  category_id       uuid references public.categories(id),
  description       text,
  amount            numeric(14,2) not null default 0,
  due_date          date not null,
  payment_method_id uuid references public.payment_methods(id),
  status            text not null default 'unpaid' check (status in ('unpaid','paid','cancelled')),
  paid_date         date,
  paid_amount       numeric(14,2),
  reference         text,
  notes             text,
  recurring_rule_id uuid references public.recurring_payables(id) on delete set null,
  period_key        text,   -- e.g. '2026-08' — idempotency for recurring generation
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_payables_due on public.payables(due_date);
create unique index if not exists uq_payable_rule_period
  on public.payables(recurring_rule_id, period_key)
  where recurring_rule_id is not null;

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
create table if not exists public.expenses (
  id                uuid primary key default gen_random_uuid(),
  vendor            text not null,
  invoice_date      date,
  received_date     date,
  category_id       uuid references public.categories(id),
  department        text,
  description       text,
  amount            numeric(14,2) not null default 0,
  due_date          date,
  status            text not null default 'new'
                    check (status in ('new','awaiting_payment','paid','awaiting_verification','verified','cancelled')),
  paid_date         date,
  payment_method_id uuid references public.payment_methods(id),
  reference         text,
  verified_by       uuid references public.profiles(id),
  verified_date     date,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_expenses_status on public.expenses(status);

-- ---------------------------------------------------------------------------
-- HRDC claims & refunds
-- ---------------------------------------------------------------------------
create table if not exists public.hrdc_claims (
  id                    uuid primary key default gen_random_uuid(),
  receivable_id         uuid references public.receivables(id) on delete set null,
  client_name           text not null,
  contact_name          text,
  product               text,
  sales_pic             text,
  -- financial
  amount_client_paid    numeric(14,2),
  claim_amount          numeric(14,2),
  approved_amount       numeric(14,2),
  hrdc_amount_received  numeric(14,2),
  hrdc_received_date    date,
  refund_amount_due     numeric(14,2),
  -- grant
  grant_application_date date,
  grant_reference       text,
  grant_approval_date   date,
  grant_status          text,
  -- training
  training_start_date   date,
  training_end_date     date,
  -- documentation
  documents_complete    boolean not null default false,
  documents_collected_date date,
  -- claim
  claim_submitted_date  date,
  claim_status          text,
  claim_approved_date   date,
  -- query
  query_received        boolean not null default false,
  query_received_date   date,
  query_details         text,
  query_replied_date    date,
  -- refund
  refund_payment_method_id uuid references public.payment_methods(id),
  refund_reference      text,
  -- communication
  grant_approval_notification_sent boolean not null default false,
  grant_approval_notification_date date,
  refund_processing_notification_sent boolean not null default false,
  refund_processing_notification_date date,
  -- lifecycle stage (see lib/finance/hrdc)
  stage                 text not null default 'client_payment_received',
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.hrdc_refunds (
  id                uuid primary key default gen_random_uuid(),
  claim_id          uuid not null references public.hrdc_claims(id) on delete cascade,
  amount            numeric(14,2) not null,
  refund_date       date not null,
  payment_method_id uuid references public.payment_methods(id),
  reference         text,
  notes             text,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id)
);
create index if not exists idx_refunds_claim on public.hrdc_refunds(claim_id);

-- ---------------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------------
create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id   uuid,
  action      text not null,
  actor       uuid references public.profiles(id),
  summary     text,
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_activity_entity on public.activity_log(entity_type, entity_id);

-- updated_at trigger
create or replace function public.touch_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','bank_accounts','receivables','payment_schedules',
    'recurring_payables','payables','expenses','hrdc_claims'
  ] loop
    execute format(
      'drop trigger if exists trg_touch_%1$s on public.%1$s;
       create trigger trg_touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;
