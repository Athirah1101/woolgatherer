// Receivables derivation: schedule status, deal totals, next payment, overdue,
// collection status, and payment allocation. All pure — the source of truth is
// the schedule + payment + allocation rows; nothing here is manually maintained.

import type {
  PaymentAllocation,
  PaymentSchedule,
  ReceivablePayment,
} from "@/lib/types";
import { addMonths, daysOverdue, diffDays } from "./dates";
import { round2, sumMoney, subMoney, toSen, fromSen } from "./money";

export const DUE_SOON_DAYS = 7;

export type ScheduleStatus =
  | "upcoming"
  | "due_soon"
  | "due_today"
  | "partially_paid"
  | "paid"
  | "partially_overdue"
  | "overdue";

export interface ScheduleView {
  id: string;
  due_date: string;
  expected: number;
  allocated: number;
  outstanding: number;
  status: ScheduleStatus;
  daysOverdue: number;
  notes: string | null;
}

export type CollectionStatus = "unpaid" | "partially_paid" | "paid" | "overpaid";

export interface ReceivableSummary {
  totalExpected: number; // sum of schedule expected amounts
  totalPaid: number; // sum of (non-voided) payments
  totalAllocated: number;
  outstanding: number;
  overdueAmount: number;
  daysOverdue: number;
  credit: number; // unapplied overpayment
  collectionStatus: CollectionStatus;
  nextDueDate: string | null;
  nextDueAmount: number;
  schedules: ScheduleView[];
}

function scheduleStatus(
  expected: number,
  allocated: number,
  dueDate: string,
  today: string,
): ScheduleStatus {
  const outstandingSen = toSen(expected) - toSen(allocated);
  const overdue = diffDays(dueDate, today) > 0; // due date strictly in the past
  if (outstandingSen <= 0) return "paid";
  if (toSen(allocated) > 0) return overdue ? "partially_overdue" : "partially_paid";
  // nothing paid yet
  if (overdue) return "overdue";
  const d = diffDays(today, dueDate);
  if (d === 0) return "due_today";
  if (d <= DUE_SOON_DAYS) return "due_soon";
  return "upcoming";
}

/**
 * Derive everything about a receivable from its schedules, payments and
 * allocations. `today` is passed explicitly so the logic is deterministic.
 */
export function summarizeReceivable(
  schedules: PaymentSchedule[],
  payments: ReceivablePayment[],
  allocations: PaymentAllocation[],
  today: string,
): ReceivableSummary {
  const livePayments = payments.filter((p) => !p.voided);
  const livePaymentIds = new Set(livePayments.map((p) => p.id));
  const liveAllocations = allocations.filter((a) => livePaymentIds.has(a.payment_id));

  const allocBySchedule = new Map<string, number>();
  for (const a of liveAllocations) {
    if (!a.schedule_id) continue;
    allocBySchedule.set(a.schedule_id, toSen(allocBySchedule.get(a.schedule_id) ?? 0) + toSen(a.amount));
  }

  const sorted = [...schedules].sort(
    (a, b) => a.due_date.localeCompare(b.due_date) || a.sort_order - b.sort_order,
  );

  const views: ScheduleView[] = sorted.map((s) => {
    const allocated = fromSen(allocBySchedule.get(s.id) ?? 0);
    const outstanding = Math.max(0, subMoney(s.expected_amount, allocated));
    return {
      id: s.id,
      due_date: s.due_date,
      expected: s.expected_amount,
      allocated,
      outstanding,
      status: scheduleStatus(s.expected_amount, allocated, s.due_date, today),
      daysOverdue: outstanding > 0 ? daysOverdue(s.due_date, today) : 0,
      notes: s.notes,
    };
  });

  const totalExpected = sumMoney(sorted.map((s) => s.expected_amount));
  const totalPaid = sumMoney(livePayments.map((p) => p.amount));
  const totalAllocated = sumMoney(liveAllocations.map((a) => a.amount));
  // Outstanding = deal amount − total paid (per Finance's preferred formula).
  const outstanding = Math.max(0, subMoney(totalExpected, totalPaid));
  const credit = Math.max(0, subMoney(totalPaid, totalExpected));

  const overdueViews = views.filter((v) => v.outstanding > 0 && diffDays(v.due_date, today) > 0);
  const overdueAmount = sumMoney(overdueViews.map((v) => v.outstanding));
  const dealDaysOverdue = overdueViews.reduce((max, v) => Math.max(max, v.daysOverdue), 0);

  const next = views.find((v) => v.outstanding > 0) ?? null;

  let collectionStatus: CollectionStatus;
  if (totalExpected === 0) collectionStatus = totalPaid > 0 ? "overpaid" : "unpaid";
  else if (outstanding <= 0) collectionStatus = credit > 0 ? "overpaid" : "paid";
  else if (totalPaid > 0) collectionStatus = "partially_paid";
  else collectionStatus = "unpaid";

  return {
    totalExpected,
    totalPaid,
    totalAllocated,
    outstanding,
    overdueAmount,
    daysOverdue: dealDaysOverdue,
    credit,
    collectionStatus,
    nextDueDate: next?.due_date ?? null,
    nextDueAmount: next?.outstanding ?? 0,
    schedules: views,
  };
}

export interface AllocationResult {
  allocations: { schedule_id: string; amount: number }[];
  credit: number; // amount left unapplied
}

/**
 * Allocate a newly recorded payment across schedules.
 * Fills a `targetScheduleId` first (if given), then earliest-outstanding-first.
 * Any excess beyond all schedules is returned as unapplied credit.
 */
export function allocatePayment(
  amount: number,
  schedules: PaymentSchedule[],
  existingAllocations: PaymentAllocation[],
  targetScheduleId?: string | null,
): AllocationResult {
  const allocatedBySchedule = new Map<string, number>();
  for (const a of existingAllocations) {
    if (!a.schedule_id) continue;
    allocatedBySchedule.set(
      a.schedule_id,
      toSen(allocatedBySchedule.get(a.schedule_id) ?? 0) + toSen(a.amount),
    );
  }

  const ordered = [...schedules].sort(
    (a, b) => a.due_date.localeCompare(b.due_date) || a.sort_order - b.sort_order,
  );
  if (targetScheduleId) {
    ordered.sort((a, b) =>
      a.id === targetScheduleId ? -1 : b.id === targetScheduleId ? 1 : 0,
    );
  }

  let remaining = toSen(amount);
  const allocations: { schedule_id: string; amount: number }[] = [];
  for (const s of ordered) {
    if (remaining <= 0) break;
    const already = allocatedBySchedule.get(s.id) ?? 0;
    const capacity = toSen(s.expected_amount) - already;
    if (capacity <= 0) continue;
    const take = Math.min(capacity, remaining);
    allocations.push({ schedule_id: s.id, amount: fromSen(take) });
    remaining -= take;
  }

  return { allocations, credit: round2(fromSen(Math.max(0, remaining))) };
}

/** Generate a preset instalment schedule. Finance can edit afterwards. */
export function generateSchedule(
  planType: string,
  totalAmount: number,
  startDate: string,
): { due_date: string; expected_amount: number }[] {
  const counts: Record<string, number> = {
    full: 1,
    "3_instalments": 3,
    "6_instalments": 6,
    "12_instalments": 12,
    "24_instalments": 24,
    "36_instalments": 36,
    monthly: 12,
  };
  const n = counts[planType] ?? 1;
  if (n <= 1) return [{ due_date: startDate, expected_amount: round2(totalAmount) }];

  // Even split with the rounding remainder folded into the first instalment.
  const totalSen = toSen(totalAmount);
  const base = Math.floor(totalSen / n);
  const remainder = totalSen - base * n;
  const rows: { due_date: string; expected_amount: number }[] = [];
  for (let i = 0; i < n; i++) {
    const sen = base + (i === 0 ? remainder : 0);
    rows.push({ due_date: addMonths(startDate, i), expected_amount: fromSen(sen) });
  }
  return rows;
}

export const PAYMENT_PLAN_OPTIONS = [
  { value: "full", label: "Full Payment" },
  { value: "monthly", label: "Monthly" },
  { value: "3_instalments", label: "3 Instalments" },
  { value: "6_instalments", label: "6 Instalments" },
  { value: "12_instalments", label: "12 Instalments" },
  { value: "24_instalments", label: "24 Instalments" },
  { value: "36_instalments", label: "36 Instalments" },
  { value: "custom", label: "Custom Schedule" },
];

export function collectionStatusLabel(s: CollectionStatus): string {
  return {
    unpaid: "Unpaid",
    partially_paid: "Partially Paid",
    paid: "Paid",
    overpaid: "Overpaid (credit)",
  }[s];
}

export function scheduleStatusLabel(s: ScheduleStatus): string {
  return {
    upcoming: "Upcoming",
    due_soon: "Due Soon",
    due_today: "Due Today",
    partially_paid: "Partially Paid",
    paid: "Paid",
    partially_overdue: "Partially Overdue",
    overdue: "Overdue",
  }[s];
}
