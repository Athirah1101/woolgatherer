@AGENTS.md

# FinanceOS — reference data sources (read these; don't ask the user to resend)

Athirah is the source of truth for receivables. When she says "refer to the
sheets", use these two Google Drive files (Google Drive connector →
`download_file_content`; export the native Sheet as xlsx so cell colours come
through, then parse with openpyxl):

1. **Receivables tab** — "[RETIRED] Vertex Mastery 2026 Cashflow Tracker"
   https://docs.google.com/spreadsheets/d/1ONbdZt2n_tVqpW2-vBw0Mqv0uDpu9ZNoa37-Ur3t8PQ
   Drive fileId `1ONbdZt2n_tVqpW2-vBw0Mqv0uDpu9ZNoa37-Ur3t8PQ`, tab `Receivables`.
   - Row per customer. Cols: A Product, B Customer Name, D Original Deal Amount,
     G First Payment Date, L Payment Plan, N Total Amount Paid (often a formula
     whose literal numbers are pre-2026 lump payments), O Total overdue till
     31 Jan 2026, P..AM = monthly cells Feb 2026 → Jan 2028.
   - **Monthly cell value = amount DUE that month. Cell COLOUR = status:
     green `FFD9EAD3` = paid, red `FFF4CCCC` = unpaid.**

2. **Monthly Customer List tab** — "Cash Flow Tracker (update).xlsx"
   https://docs.google.com/spreadsheets/d/1kNDjH82pHUmPun_GNz--1byBrjuoVllw
   Drive fileId `1kNDjH82pHUmPun_GNz--1byBrjuoVllw`, tab `Monthly Customer List`.
   - Row per customer/plan. Cols: A name+product, B months, C start date,
     D deal amount, F channel (e.g. Payex), G gross monthly, H net monthly;
     I..AR = monthly received amounts Jan 2024 → Dec 2026 (row 3 = month dates).
   - Older (2024–2025) month-by-month payment history lives here.

Rule: every receivable must show **every individual payment** (one record per
month paid), never a single "paid to date" lump.
