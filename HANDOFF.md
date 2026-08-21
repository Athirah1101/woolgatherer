# FinanceOS — Developer Handoff

Internal operational finance app for Vertex Mastery (not an accounting system — Xero remains the source of truth). Finance enters data once; the app derives totals, outstanding, overdue, status, cashflow, HRDC refund countdowns, etc.

## Stack
- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Supabase** (Postgres + Auth) via `@supabase/ssr`
- **Vitest** for the pure finance calc engine (`src/lib/finance/`)

> ⚠️ This is a newer Next.js than most training data. Conventions differ — read the guides in `node_modules/next/dist/docs/` before making framework-level changes. See `AGENTS.md`.

## Run locally
```bash
npm install
# create .env.local (see below)
npm run dev          # http://localhost:3000
npm run build        # production build
npx vitest run       # run the calc-engine tests (should be all green)
```

## Environment variables (`.env.local`)
These are the **public** client keys (safe to commit to a private repo / share within the team — they are the anon/publishable keys, protected by Row-Level Security):
```
NEXT_PUBLIC_SUPABASE_URL=https://nplqwwwuuyqdcyeqvgil.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_GDfzTCmSSvBwpeKvfuwoZg_DA0F04f8
```
For any server-side admin scripts you add later, get the **service-role** key from the Supabase dashboard — never commit that one.

## Deploy
Currently on Vercel (project `finance-os`, team `athirah1101s-projects`), deployed via `npx vercel --prod`.
- Functions are pinned to **Seoul (`icn1`)** in `vercel.json` to co-locate with the Supabase DB (ap-northeast-2). Keep them in the same region.
- Set the two env vars above in the Vercel project (Production) as well.
- Best next step: connect this repo to Vercel's Git integration so pushes auto-deploy.

## Layout
- `src/lib/finance/` — pure, tested calc engine (money in integer **sen**; dates are date-only ISO strings, no timezone drift).
- `src/lib/data/` — Supabase read helpers (batched; no N+1).
- `src/lib/supabase/` — SSR client + auth middleware (`src/proxy.ts` wires it up).
- `src/app/(app)/` — the authenticated app (dashboard, receivables, payables, hrdc, refunds, cashflow, settings).
- Roles: `finance` (full), `sales` (own receivables only), `management` (read-only). Enforced by RLS + `requireRole()`.

## Getting it onto GitHub
The repo `github.com/Athirah1101/woolgatherer` is currently empty (the original author's session couldn't push to it). To populate it from this folder:
```bash
git init            # if not already a repo
git add -A
git commit -m "Import FinanceOS"
git branch -M main
git remote add origin <your-repo-url>   # or the existing woolgatherer repo if you have write access
git push -u origin main
```
