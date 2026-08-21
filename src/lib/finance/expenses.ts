// Expense status workflow helpers.

import type { ExpenseStatus } from "@/lib/types";

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  new: "New",
  awaiting_payment: "Awaiting Payment",
  paid: "Paid",
  awaiting_verification: "Awaiting Verification",
  verified: "Verified",
  cancelled: "Cancelled",
};

export const EXPENSE_STATUS_FLOW: ExpenseStatus[] = [
  "new",
  "awaiting_payment",
  "paid",
  "awaiting_verification",
  "verified",
];

/** Statuses that still need someone to act. */
export function expenseNeedsPayment(s: ExpenseStatus): boolean {
  return s === "new" || s === "awaiting_payment";
}
export function expenseNeedsVerification(s: ExpenseStatus): boolean {
  return s === "awaiting_verification";
}
