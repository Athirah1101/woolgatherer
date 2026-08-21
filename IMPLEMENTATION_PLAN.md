# FinanceOS — V1 Implementation Plan

Internal operational finance tracker for **Vertex Mastery**. Replaces the "Vertex Mastery 2026 Cashflow Tracker" spreadsheet. **Not an accounting system** — Xero remains the official accounting system. FinanceOS gives cashflow visibility and removes repetitive manual spreadsheet work.

## Core principle
Finance enters a fact **once** (e.g. records a payment). FinanceOS derives everything else — totals, outstanding, overdue, next payment, status, cashflow — from source transactions. No manual formulas, no monthly columns, no manual colouring.

## 1. Tech stack
- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS v4**
- **Supabase** (Postgres 17 + Auth), accessed via `@supabase/ssr`
- **Vitest** for the calculation unit tests (scenarios A–U)
- Deploy target: Vercel (env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

## 2. Database structure (source records → derived values)
- `profiles` — user, role (`finance` | `sales` | `management`), `sales_pic`
- `bank_accounts` — manual balances (Current Cash aggregates active accounts)
- `categories` (kind: expense/payable), `payment_methods`
- `receivables` (deal) → `payment_schedules` (one row per instalment) → `receivable_payments` (actual txns) → `payment_allocations` (payment ↔ schedule)
- `payables`, `recurring_payables` (rules that generate payables)
- `expenses`
- `hrdc_claims`, `hrdc_refunds` (partial refunds)
- `activity_log` — action / user / timestamp / old / new

All money is `numeric(14,2)` (no floats). All business deadlines are `date` (date-only, no timezone drift).

## 3. Page / module structure (navigation)
Dashboard · Money In (Receivables, HRDC Claims) · Money Out (Payables, Expenses) · Cashflow · Settings (Recurring Payables, Categories, Payment Methods, Users & Access, Bank Accounts)

## 4. Major workflows
- **Record Receivable Payment** → store txn → allocate to schedule(s) FIFO → recompute paid/outstanding/overdue/next/status → feeds cashflow actual.
- **Recurring Payables** → rule generates upcoming payable records (idempotent per period); variable amounts editable per month.
- **Expense flow** → New → Awaiting Payment → Paid → Awaiting Verification → Verified (system sets derived fields).
- **HRDC lifecycle** → Client Paid → Grant → Approved → Training → Docs → Submitted → Processing → HRD Funds Received → Refund Due → Refunded → Completed, with training window (14–90d), submission target (+7d), query deadline (+5d), and the **critical** refund countdown (**HRD funds received + 30 calendar days**).
- **Cashflow** derives Expected/Actual In/Out from the above with no double counting.

## 5. Permissions
- **Finance**: full access (create/edit/record/verify/view all).
- **Sales**: only receivables where `sales_pic` = them (collection fields only). No bank balances, payables, expenses, cashflow, HRDC, costs. Enforced by Postgres RLS **and** the app layer. Finance has **View As: Sales**.
- **Management**: high-level dashboard visibility; read-only.

## 6. Calculated fields / automation
Derived in tested pure functions (`src/lib/finance/*`): receivable totals & collection status, schedule status, payable attention, HRDC deadlines & refund countdown, cashflow aggregation. Nothing manually maintained.

## 7. Implementation phases
1. Foundation — schema, RLS, auth, nav, settings
2. Receivables + Sales View
3. Payables + recurring rules
4. Expenses
5. HRDC Claims
6. Cashflow
7. Dashboard + Attention Required
8. Tests (A–U), seed/demo data, cleanup

## Explicitly NOT in V1
Bank integrations/feeds, PayEx/Stripe/EzBeli, Xero sync, Google Drive filing, OCR, complex approval chains, WhatsApp/email automation, Ka-ching auto-import (receivable creation is structured so an API can create the same record later). AI-for-AI's-sake.
