// HRDC claim derivation: lifecycle stage, training window (14–90d),
// claim submission target (+7d), query reply deadline (+5d), and the CRITICAL
// client-refund countdown (HRD funds received + 30 calendar days).

import type { HrdcClaim, HrdcRefund } from "@/lib/types";
import { addDays, daysUntil, diffDays } from "./dates";
import { subMoney, sumMoney } from "./money";

export const TRAINING_MIN_DAYS = 14;
export const TRAINING_MAX_DAYS = 90;
export const CLAIM_SUBMISSION_DAYS = 7;
export const QUERY_REPLY_DAYS = 5;
export const REFUND_DAYS = 30;

export type HrdcStage =
  | "client_payment_received"
  | "grant_application"
  | "grant_approved"
  | "training"
  | "documents_collected"
  | "claim_submitted"
  | "hrd_processing"
  | "hrd_payment_received"
  | "client_refund_due"
  | "client_refunded"
  | "completed";

export const HRDC_STAGES: HrdcStage[] = [
  "client_payment_received",
  "grant_application",
  "grant_approved",
  "training",
  "documents_collected",
  "claim_submitted",
  "hrd_processing",
  "hrd_payment_received",
  "client_refund_due",
  "client_refunded",
  "completed",
];

export const HRDC_STAGE_LABEL: Record<HrdcStage, string> = {
  client_payment_received: "Client Payment Received",
  grant_application: "Grant Application",
  grant_approved: "Grant Approved",
  training: "Training",
  documents_collected: "Documents Collected",
  claim_submitted: "Claim Submitted",
  hrd_processing: "HRD Corp Processing",
  hrd_payment_received: "HRD Corp Payment Received",
  client_refund_due: "Client Refund Due",
  client_refunded: "Client Refunded",
  completed: "Completed",
};

// ---- Training window (14–90 days after grant approval) ----
export interface TrainingWindow {
  earliest: string;
  latest: string;
}
export function trainingWindow(grantApprovalDate: string | null): TrainingWindow | null {
  if (!grantApprovalDate) return null;
  return {
    earliest: addDays(grantApprovalDate, TRAINING_MIN_DAYS),
    latest: addDays(grantApprovalDate, TRAINING_MAX_DAYS),
  };
}
/** Whether the planned training start falls inside the permitted window. */
export function trainingWindowWarning(claim: HrdcClaim): string | null {
  const win = trainingWindow(claim.grant_approval_date);
  if (!win || !claim.training_start_date) return null;
  if (diffDays(win.earliest, claim.training_start_date) < 0)
    return `Training starts before the earliest permitted date (${win.earliest}).`;
  if (diffDays(claim.training_start_date, win.latest) < 0)
    return `Training starts after the latest permitted date (${win.latest}).`;
  return null;
}

// ---- Claim submission target (within 1 week after training) ----
export function claimSubmissionTarget(trainingEndDate: string | null): string | null {
  return trainingEndDate ? addDays(trainingEndDate, CLAIM_SUBMISSION_DAYS) : null;
}

// ---- Query reply deadline (+5 calendar days) ----
export function queryReplyDeadline(queryReceivedDate: string | null): string | null {
  return queryReceivedDate ? addDays(queryReceivedDate, QUERY_REPLY_DAYS) : null;
}
export interface QueryStatus {
  open: boolean;
  deadline: string | null;
  days: number | null; // days until deadline (negative = overdue)
  text: string | null;
}
export function queryStatus(claim: HrdcClaim, today: string): QueryStatus {
  if (!claim.query_received || !claim.query_received_date)
    return { open: false, deadline: null, days: null, text: null };
  const replied = !!claim.query_replied_date;
  const deadline = queryReplyDeadline(claim.query_received_date)!;
  if (replied)
    return { open: false, deadline, days: null, text: "Query replied" };
  const days = daysUntil(deadline, today);
  let text: string;
  if (days < 0) text = `Query reply overdue by ${-days} day${-days === 1 ? "" : "s"}`;
  else if (days === 0) text = "Query reply due today";
  else if (days === 1) text = "Query reply due tomorrow";
  else text = `Query reply due in ${days} days`;
  return { open: true, deadline, days, text };
}

// ---- CRITICAL: refund deadline = HRD funds received + 30 calendar days ----
export function refundDeadline(hrdcReceivedDate: string | null): string | null {
  return hrdcReceivedDate ? addDays(hrdcReceivedDate, REFUND_DAYS) : null;
}

export type RefundStatus = "not_due" | "due" | "partial" | "refunded";
export interface RefundSummary {
  amountDue: number;
  refunded: number;
  remaining: number;
  status: RefundStatus;
  deadline: string | null;
  /** Countdown only exists once HRD funds are actually received. */
  countdownActive: boolean;
}

export function refundSummary(claim: HrdcClaim, refunds: HrdcRefund[]): RefundSummary {
  const amountDue = claim.refund_amount_due ?? 0;
  const refunded = sumMoney(refunds.map((r) => r.amount));
  const remaining = Math.max(0, subMoney(amountDue, refunded));
  const received = !!claim.hrdc_received_date;

  let status: RefundStatus;
  if (!received) status = "not_due";
  else if (remaining <= 0 && refunded > 0) status = "refunded";
  else if (refunded > 0) status = "partial";
  else status = "due";

  return {
    amountDue,
    refunded,
    remaining,
    status,
    deadline: refundDeadline(claim.hrdc_received_date),
    countdownActive: received && remaining > 0,
  };
}

export type RefundAttentionColor = "green" | "yellow" | "orange" | "red";
export interface RefundAttention {
  active: boolean;
  color: RefundAttentionColor;
  days: number; // days until deadline (negative = overdue)
  text: string;
}
/**
 * Refund countdown attention. Returns null unless HRD funds have been received
 * and a refund is still outstanding — the 30-day clock never starts before that.
 */
export function refundAttention(
  claim: HrdcClaim,
  refunds: HrdcRefund[],
  today: string,
): RefundAttention | null {
  const summary = refundSummary(claim, refunds);
  if (!summary.countdownActive || !summary.deadline) return null;
  const days = daysUntil(summary.deadline, today);

  let color: RefundAttentionColor;
  if (days <= 0) color = "red";
  else if (days <= 7) color = "orange";
  else if (days <= 15) color = "yellow";
  else color = "green";

  let text: string;
  if (days < 0) text = `Refund overdue by ${-days} day${-days === 1 ? "" : "s"}`;
  else if (days === 0) text = "Refund due today";
  else if (days === 1) text = "Refund due tomorrow";
  else text = `Refund due in ${days} days`;

  return { active: true, color, days, text };
}

/**
 * Derive the lifecycle stage from the record's data (single source of truth).
 * `stage` stored on the row is used only as a manual override for exceptions.
 */
export function deriveStage(claim: HrdcClaim, refunds: HrdcRefund[]): HrdcStage {
  const r = refundSummary(claim, refunds);
  if (claim.hrdc_received_date) {
    if (r.amountDue > 0 && r.remaining <= 0) return "completed";
    if (r.refunded > 0) return "client_refunded";
    return "client_refund_due";
  }
  if (claim.claim_submitted_date) return "hrd_processing";
  if (claim.documents_complete || claim.documents_collected_date)
    return "documents_collected";
  if (claim.training_start_date) return "training";
  if (claim.grant_approval_date) return "grant_approved";
  if (claim.grant_application_date) return "grant_application";
  return "client_payment_received";
}

/** Group a stage into the section-33 dashboard tab. */
export function stageTab(stage: HrdcStage): string {
  switch (stage) {
    case "client_payment_received":
    case "grant_application":
      return "application";
    case "grant_approved":
    case "training":
      return "training_upcoming";
    case "documents_collected":
      return "claim_to_submit";
    case "claim_submitted":
    case "hrd_processing":
      return "processing";
    case "hrd_payment_received":
    case "client_refund_due":
    case "client_refunded":
      return "refund_due";
    case "completed":
      return "completed";
  }
}
