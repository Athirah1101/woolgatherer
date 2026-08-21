// Payable attention derivation + recurring-rule generation.

import type { Payable, RecurringPayable } from "@/lib/types";
import { addMonths, dayOfMonth, daysUntil, diffDays, periodKey } from "./dates";

export type PayableAttentionLevel =
  | "paid"
  | "cancelled"
  | "overdue"
  | "due_today"
  | "due_3"
  | "due_7"
  | "later";

export interface PayableAttention {
  level: PayableAttentionLevel;
  days: number; // days until due (negative = overdue)
  text: string;
}

export function payableAttention(
  payable: Pick<Payable, "due_date" | "status">,
  today: string,
): PayableAttention {
  if (payable.status === "paid") return { level: "paid", days: 0, text: "Paid" };
  if (payable.status === "cancelled")
    return { level: "cancelled", days: 0, text: "Cancelled" };

  const days = daysUntil(payable.due_date, today);
  if (days < 0) return { level: "overdue", days, text: `Overdue by ${-days} day${-days === 1 ? "" : "s"}` };
  if (days === 0) return { level: "due_today", days, text: "Due today" };
  if (days <= 3) return { level: "due_3", days, text: `Due in ${days} day${days === 1 ? "" : "s"}` };
  if (days <= 7) return { level: "due_7", days, text: `Due in ${days} days` };
  return { level: "later", days, text: `Due in ${days} days` };
}

export const PAYABLE_ATTENTION_LABEL: Record<PayableAttentionLevel, string> = {
  paid: "Paid",
  cancelled: "Cancelled",
  overdue: "Overdue",
  due_today: "Due Today",
  due_3: "Due Within 3 Days",
  due_7: "Due Within 7 Days",
  later: "Later",
};

export const FREQUENCY_MONTHS: Record<RecurringPayable["frequency"], number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

/**
 * For a recurring rule, the list of period due-dates that should exist between
 * `fromISO` and `throughISO` (inclusive), respecting start/end dates.
 * Returns [{ period_key, due_date }] — idempotency is enforced by (rule, period_key).
 */
export function dueDatesForRule(
  rule: Pick<
    RecurringPayable,
    "frequency" | "due_day" | "due_month" | "start_date" | "end_date" | "active"
  >,
  fromISO: string,
  throughISO: string,
): { period_key: string; due_date: string }[] {
  if (!rule.active) return [];
  const step = FREQUENCY_MONTHS[rule.frequency];
  const out: { period_key: string; due_date: string }[] = [];

  // Walk period anchors. For yearly/quarterly rules the cycle anchors to the
  // chosen `due_month`; otherwise it falls back to the rule's start month.
  const startYear = rule.start_date.slice(0, 4);
  const anchorMonth =
    rule.frequency !== "monthly" && rule.due_month
      ? String(rule.due_month).padStart(2, "0")
      : rule.start_date.slice(5, 7);
  let anchor = `${startYear}-${anchorMonth}-01`; // first of the anchor month
  // Safety cap to avoid runaway loops.
  for (let i = 0; i < 600; i++) {
    const due = dayOfMonth(anchor, rule.due_day);
    if (diffDays(due, throughISO) < 0) break; // past the window's end
    const afterStart = diffDays(rule.start_date, due) >= 0;
    const beforeEnd = !rule.end_date || diffDays(due, rule.end_date) >= 0;
    const inWindow = diffDays(fromISO, due) >= 0;
    if (afterStart && beforeEnd && inWindow) {
      out.push({ period_key: periodKey(due), due_date: due });
    }
    anchor = addMonths(anchor, step);
  }
  return out;
}
