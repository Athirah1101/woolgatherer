# FinanceOS — Vertex Mastery

Internal operational finance tracker and cashflow visibility system. Replaces the *Vertex Mastery 2026 Cashflow Tracker* spreadsheet with a system where **Finance records what actually happened once, and FinanceOS derives everything else** — totals, outstanding, overdue, next payment, statuses, cashflow — automatically.

> **This is not an accounting system.** Xero remains Vertex Mastery's official accounting system. FinanceOS is an operational finance tracker.

## Tech stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS v4**
- **Supabase** (Postgres 17 + Auth), via `@supabase/ssr`
- **Vitest** for the calculation engine
- Deploy target: **Vercel**

## Getting started

```bash
npm install
cp .env.example .env.local   # already committed with the browser-safe publishable key
npm run dev                  # http://localhost:3000
npm test                     # calculation engine (scenarios A–U)
npm run build                # production build
```

Environment variables (`.env.local`):

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key (browser-safe; RLS protects data) |

The Supabase project (`baby-finance-os`) is already provisioned with the schema, RLS policies, reference data and demo data.

### Demo accounts

All use password **`financeos123`**:

| Role | Email | Sees |
| --- | --- | --- |
| Finance | `finance@vertexmastery.com` | Everything (full access) |
| Sales | `sales@vertexmastery.com` | Only their own receivables (collection view) |
| Sales | `sales2@vertexmastery.com` | Only their own receivables |
| Management | `management@vertexmastery.com` | Read-only high-level dashboard |

Finance can also use **View As: Sales** on the Receivables page to preview a salesperson's view.

## Architecture

```
src/
  lib/finance/        Pure, tested calculation engine (the heart of the app)
    dates.ts          Date-only helpers — no timezone drift on business deadlines
    money.ts          Sen-based arithmetic — no floating-point currency errors
    receivables.ts    Allocation, schedule status, collection status, next payment
    payables.ts       Attention levels, recurring-rule generation
    expenses.ts       Status workflow
    hrdc.ts           Training window, submission target, query deadline, 30-day refund
    cashflow.ts       Expected vs actual aggregation (no double counting)
    attention.ts      Attention Required item ordering
    display.ts        Status/attention → UI tone mapping
  lib/data/           Server data-access (fetch raw rows → run the engine)
  lib/supabase/       Browser + server clients, session proxy
  app/(app)/          Modules: dashboard, receivables, hrdc, payables, expenses, cashflow, settings
  components/         UI primitives + form/drawer client components
supabase/
  migrations/         0001_schema.sql, 0002_rls.sql
  seed.sql            Demo data
```

### Core principle

Everything derived is computed from source transactions — never manually maintained. When a payment is recorded, FinanceOS automatically updates total paid, outstanding, overdue amount, days overdue, next payment, collection status, and cashflow actual.

### Permissions (defence in depth)

Enforced by **Postgres RLS** *and* the app layer:

- **Finance** — full create/edit/record/verify/view.
- **Sales** — only receivables where `sales_pic` matches them; collection fields only. No bank balances, payables, expenses, cashflow, HRDC, or costs.
- **Management** — read-only high-level visibility.

### Key business rules

- **Receivables**: deal → schedule (one row per instalment) → actual payments → allocations. Partial payments, irregular custom schedules, multiple payments per instalment, and overpayments (excess flows to the next instalment, remainder held as visible credit) are all handled.
- **Payables**: attention (Overdue / Due Today / ≤3 / ≤7) is calculated. Recurring rules generate upcoming payables idempotently (unique per rule + period); variable amounts (EPF, utilities) are editable per month without touching history.
- **Expenses**: New → Awaiting Payment → Paid → Awaiting Verification → Verified. Recording payment moves to Awaiting Verification; verifying stamps verifier + date.
- **HRDC**: full lifecycle with training window (grant approval + 14–90 days), claim submission target (training + 7 days), query reply deadline (received + 5 days), and the **critical client-refund countdown = HRD Corp funds received + 30 calendar days** — the 30-day clock starts *only* when Finance records funds received, never before. Partial refunds supported.
- **Cashflow**: derived from all of the above. "Expected" = unsettled items only; "actual" = recorded transactions. Designed so the same money is never double-counted.

## Testing

`npm test` runs the full calculation engine against the spec's required scenarios **A–U** (receivable full/partial/irregular/multi-payment/overpayment, recurring payable generation, payable attention, HRDC training window / submission target / query deadline / refund countdown / partial refund, and cashflow expected-vs-actual with no double counting).

## Managing users

Access levels (role, Sales PIC, active) are managed in **Settings → Users & Access**. Creating brand-new *login* accounts is done in Supabase Auth (Dashboard → Authentication, or the admin API) — a profile row is auto-created by a database trigger and its role can then be set in the UI. The demo accounts were seeded this way.

## Not in V1 (by design)

Bank/PayEx/Stripe/EzBeli integrations, Xero sync, Google Drive filing, OCR, complex approval chains, WhatsApp/email automation, and Ka-ching auto-import. Receivable creation is structured cleanly so an API/form (e.g. the Ka-ching form) can create the same record later without rewriting the module.

## Note on this build environment

The schema, RLS, and demo data were applied to Supabase via the management API, and the calculation engine + full production build are verified. Live end-to-end browser testing against Supabase could **not** run inside the build sandbox because its egress policy blocks `*.supabase.co` — this restriction does not apply to a normal deployment (e.g. Vercel), where the app connects to Supabase directly.
