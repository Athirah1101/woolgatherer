// Builds the "what do we owe <person>" breakdown shown from the Owed to
// directors cards: money owed to them directly (e.g. Capital), bills paid on
// the company's behalf via their payment method (the payback), what has been
// paid back so far, and anything that looks off.

import type { Payable, PayablePayment, PaymentMethod } from "@/lib/types";
import { owedAmount } from "@/lib/finance/payables";

export interface BreakdownLine {
  name: string;
  /** ISO date, or a pre-formatted label (payback note lines keep their own text). */
  date: string | null;
  amount: number;
  note?: string;
}

export interface OwedBreakdown {
  who: string;
  total: number;
  /** Still owed to them directly (Capital, loans, anything with them as payee). */
  owed: BreakdownLine[];
  /** Bills paid via their payment method that have rolled into the payback. */
  payback: BreakdownLine[];
  paybackTotal: number;
  /** Paid via their method but not found in the payback list — worth checking. */
  notInPayback: BreakdownLine[];
  /** Unpaid bills set to be paid via their method (not owed yet). */
  upcoming: BreakdownLine[];
  /** Payments already made to them. */
  repaid: BreakdownLine[];
  /** Cancelled items under their name, for context. */
  cancelled: BreakdownLine[];
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const label = (p: Payable) => p.description?.trim() || p.payee;
const owing = (p: Payable) => p.status === "unpaid" || p.status === "partially_paid";

/** Payback bills keep an itemised list in notes: "• Name — RM1,234.50 (21 Sep 2026)". */
function parsePaybackNotes(notes: string | null): BreakdownLine[] {
  const out: BreakdownLine[] = [];
  for (const raw of (notes ?? "").split(/\r?\n/)) {
    const m = raw.match(/^[•\-*\s]*(.+?)\s+—\s+RM\s?([\d,]+(?:\.\d+)?)(?:\s*\((.+?)\))?\s*$/);
    if (!m) continue;
    out.push({ name: m[1].trim(), amount: Number(m[2].replace(/,/g, "")), date: m[3] ?? null });
  }
  return out;
}

export function buildOwedBreakdown(
  who: string,
  payables: Payable[],
  payments: PayablePayment[],
  methods: PaymentMethod[],
): OwedBreakdown {
  const person = norm(who);
  const method = methods.find((m) => norm(m.name) === person);
  const byId = new Map(payables.map((p) => [p.id, p]));
  const isHis = (p: Payable) => norm(p.payee) === person;

  const direct = payables.filter((p) => isHis(p) && !p.is_payback && owing(p));
  const owed = direct.map((p) => ({
    name: label(p),
    date: p.due_date,
    amount: owedAmount(p),
    note: Number(p.paid_amount ?? 0) > 0 ? `of ${Number(p.amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}, part-paid` : p.notes ?? undefined,
  }));

  const paybackBills = payables.filter((p) => isHis(p) && p.is_payback && owing(p));
  const payback = paybackBills.flatMap((p) => parsePaybackNotes(p.notes));
  const paybackTotal = paybackBills.reduce((s, p) => s + owedAmount(p), 0);

  // Payments made through his method, matched one-to-one (by amount) against
  // the payback list; whatever is left over isn't part of what we owe him.
  const viaMethod = method
    ? payments
        .filter((x) => x.payment_method_id === method.id && byId.get(x.payable_id) && !isHis(byId.get(x.payable_id)!))
        .sort((a, b) => b.paid_date.localeCompare(a.paid_date))
    : [];
  const pool = payback.map((l) => Math.round(l.amount * 100));
  const notInPayback: BreakdownLine[] = [];
  for (const x of viaMethod) {
    const cents = Math.round(Number(x.amount) * 100);
    const i = pool.indexOf(cents);
    if (i >= 0) pool.splice(i, 1);
    else notInPayback.push({ name: label(byId.get(x.payable_id)!), date: x.paid_date, amount: Number(x.amount) });
  }
  notInPayback.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  const upcoming = method
    ? payables
        .filter((p) => p.payment_method_id === method.id && owing(p) && !isHis(p))
        .map((p) => ({ name: label(p), date: p.due_date, amount: owedAmount(p) }))
    : [];

  const hisIds = new Set(payables.filter(isHis).map((p) => p.id));
  const repaid = payments
    .filter((x) => hisIds.has(x.payable_id))
    .map((x) => ({ name: label(byId.get(x.payable_id)!), date: x.paid_date, amount: Number(x.amount) }))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const cancelled = payables
    .filter((p) => p.status === "cancelled" && norm(p.payee).includes(person))
    .map((p) => ({ name: `${label(p)}${isHis(p) ? "" : ` (${p.payee})`}`, date: p.due_date, amount: Number(p.amount), note: p.notes ?? undefined }));

  const total = owed.reduce((s, l) => s + l.amount, 0) + paybackTotal;
  return { who, total, owed, payback, paybackTotal, notInPayback, upcoming, repaid, cancelled };
}
