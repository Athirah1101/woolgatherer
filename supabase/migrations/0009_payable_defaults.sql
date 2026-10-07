-- Default amounts per payee + category (e.g. Nini / Petty Cash = RM1,500),
-- used to pre-fill the amount on a new payable.
create table if not exists public.payable_defaults (
  id uuid primary key default gen_random_uuid(),
  payee text not null,
  category_id uuid references public.categories(id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists payable_defaults_unique
  on public.payable_defaults (lower(btrim(payee)), coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.payable_defaults enable row level security;
create policy payable_defaults_read on public.payable_defaults for select
  using (public.my_role() in ('finance','management'));
create policy payable_defaults_write on public.payable_defaults for all
  using (public.my_role() = 'finance') with check (public.my_role() = 'finance');
