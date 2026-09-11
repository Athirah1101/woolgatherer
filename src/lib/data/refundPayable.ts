// Keeps a refund case (an HRDC claim) and its mirror payable in sync.
// The mirror payable is tagged source="refund" and invoice_ref = claim id.

import type { SupabaseClient } from "@supabase/supabase-js";
import { todayISO } from "@/lib/finance/dates";
import { refundTypeLabel } from "@/app/(app)/refunds/refundTypes";

/** Money still owed back to the client on a refund case. */
export function refundDueAmount(claim: { refund_amount_due?: number | null; claim_amount?: number | null }): number {
  return Number(claim.refund_amount_due ?? claim.claim_amount ?? 0);
}

/** Due date for the mirror payable: 30 days after HRDC funds arrive, else today. */
export function refundPayableDue(hrdcReceivedDate: string | null | undefined): string {
  return hrdcReceivedDate
    ? new Date(new Date(hrdcReceivedDate).getTime() + 30 * 86400000).toISOString().slice(0, 10)
    : todayISO();
}

export function refundPayableDescription(refundType: string | null | undefined): string {
  return `Client refund (${refundTypeLabel(refundType)})`;
}

/**
 * Recompute the mirror payable for a refund case from the claim + its recorded
 * refunds, so paying/recording on either side keeps the other in step. No-op if
 * the case has no mirror payable (e.g. an older case never mirrored).
 */
export async function syncRefundPayable(
  supabase: SupabaseClient,
  claimId: string,
): Promise<void> {
  const { data: claim } = await supabase
    .from("hrdc_claims")
    .select("id, client_name, refund_type, refund_amount_due, claim_amount, hrdc_received_date")
    .eq("id", claimId)
    .maybeSingle();
  if (!claim) return;

  const { data: pay } = await supabase
    .from("payables")
    .select("id")
    .eq("source", "refund")
    .eq("invoice_ref", claimId)
    .maybeSingle();
  if (!pay) return;

  const due = refundDueAmount(claim);
  const { data: refunds } = await supabase
    .from("hrdc_refunds")
    .select("amount, refund_date")
    .eq("claim_id", claimId);
  const refunded = (refunds ?? []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const fully = due > 0 && refunded >= due - 0.005;
  const partial = refunded > 0 && !fully;
  const latest = (refunds ?? [])
    .map((r) => r.refund_date as string | null)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);

  await supabase
    .from("payables")
    .update({
      payee: claim.client_name,
      description: refundPayableDescription(claim.refund_type),
      amount: due,
      paid_amount: refunded,
      status: fully ? "paid" : partial ? "partially_paid" : "unpaid",
      paid_date: fully || partial ? latest ?? todayISO() : null,
      due_date: refundPayableDue(claim.hrdc_received_date),
    })
    .eq("id", pay.id);
}
