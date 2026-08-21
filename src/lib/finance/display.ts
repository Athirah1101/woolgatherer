// Maps derived statuses/attention to UI tones + labels. Keeps Status and
// Attention visually distinct throughout the app.

import type { Tone } from "@/components/ui";
import type { CollectionStatus, ScheduleStatus } from "./receivables";
import { collectionStatusLabel, scheduleStatusLabel } from "./receivables";
import type { PayableAttentionLevel } from "./payables";
import { PAYABLE_ATTENTION_LABEL } from "./payables";
import type { ExpenseStatus } from "@/lib/types";
import { EXPENSE_STATUS_LABEL } from "./expenses";
import type { HrdcStage, RefundAttentionColor, RefundStatus } from "./hrdc";
import { HRDC_STAGE_LABEL } from "./hrdc";

export function collectionStatusChip(s: CollectionStatus): { label: string; tone: Tone } {
  const tone: Record<CollectionStatus, Tone> = {
    unpaid: "gray",
    partially_paid: "amber",
    paid: "green",
    overpaid: "blue",
  };
  return { label: collectionStatusLabel(s), tone: tone[s] };
}

export function scheduleStatusChip(s: ScheduleStatus): { label: string; tone: Tone } {
  const tone: Record<ScheduleStatus, Tone> = {
    upcoming: "gray",
    due_soon: "blue",
    due_today: "amber",
    partially_paid: "amber",
    paid: "green",
    partially_overdue: "orange",
    overdue: "red",
  };
  return { label: scheduleStatusLabel(s), tone: tone[s] };
}

export function payableAttentionChip(l: PayableAttentionLevel): { label: string; tone: Tone } {
  const tone: Record<PayableAttentionLevel, Tone> = {
    paid: "green",
    cancelled: "gray",
    overdue: "red",
    due_today: "orange",
    due_3: "amber",
    due_7: "blue",
    later: "gray",
  };
  return { label: PAYABLE_ATTENTION_LABEL[l], tone: tone[l] };
}

export function expenseStatusChip(s: ExpenseStatus): { label: string; tone: Tone } {
  const tone: Record<ExpenseStatus, Tone> = {
    new: "gray",
    awaiting_payment: "amber",
    paid: "blue",
    awaiting_verification: "orange",
    verified: "green",
    cancelled: "gray",
  };
  return { label: EXPENSE_STATUS_LABEL[s], tone: tone[s] };
}

export function hrdcStageChip(s: HrdcStage): { label: string; tone: Tone } {
  const tone: Record<HrdcStage, Tone> = {
    client_payment_received: "gray",
    grant_application: "blue",
    grant_approved: "indigo",
    training: "indigo",
    documents_collected: "blue",
    claim_submitted: "amber",
    hrd_processing: "amber",
    hrd_payment_received: "green",
    client_refund_due: "orange",
    client_refunded: "green",
    completed: "green",
  };
  return { label: HRDC_STAGE_LABEL[s], tone: tone[s] };
}

export function refundStatusChip(s: RefundStatus): { label: string; tone: Tone } {
  const map: Record<RefundStatus, { label: string; tone: Tone }> = {
    not_due: { label: "Not Due", tone: "gray" },
    due: { label: "Refund Due", tone: "orange" },
    partial: { label: "Partially Refunded", tone: "amber" },
    refunded: { label: "Refunded", tone: "green" },
  };
  return map[s];
}

export function refundColorTone(c: RefundAttentionColor): Tone {
  return { green: "green", yellow: "amber", orange: "orange", red: "red" }[c] as Tone;
}

// Deal-level attention (timing), separate from collection status.
import type { ReceivableSummary } from "./receivables";
import { relativeDays, daysUntil } from "./dates";

export function receivableAttention(
  summary: ReceivableSummary,
  today: string,
): { label: string; tone: Tone } {
  if (summary.overdueAmount > 0) {
    return { label: `${summary.daysOverdue} day${summary.daysOverdue === 1 ? "" : "s"} overdue`, tone: "red" };
  }
  if (summary.nextDueDate && summary.nextDueAmount > 0) {
    const d = daysUntil(summary.nextDueDate, today);
    if (d <= 7) {
      return { label: `Due ${relativeDays(summary.nextDueDate, today)}`, tone: d <= 2 ? "amber" : "blue" };
    }
  }
  if (summary.collectionStatus === "paid") return { label: "Settled", tone: "green" };
  return { label: "—", tone: "gray" };
}
