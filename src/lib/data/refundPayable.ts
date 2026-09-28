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
    .select("id, description")
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
      // Keep a custom description (e.g. "Yeoh Ze Yong Compensation for L2")
      // typed in Payables; only refresh the auto-generated one.
      description:
        !pay.description || pay.description.startsWith("Client refund (")
          ? refundPayableDescription(claim.refund_type)
          : pay.description,
      amount: due,
      paid_amount: refunded,
      status: fully ? "paid" : partial ? "partially_paid" : "unpaid",
      paid_date: fully || partial ? latest ?? todayISO() : null,
      due_date: refundPayableDue(claim.hrdc_received_date),
    })
    .eq("id", pay.id);
}

/** The payables category that means "this is really a client refund". */
export const REFUND_CATEGORY_NAME = "Refund to clients";

/** "Money received" date that makes refundPayableDue() land on `dueDate`. */
function receivedDateFor(dueDate: string): string {
  return new Date(new Date(dueDate).getTime() - 30 * 86400000).toISOString().slice(0, 10);
}

/**
 * A payable created straight in Payables under "Refund to clients" has no
 * refund case behind it. Create one (type "Other") and tag the payable as its
 * mirror, so it shows in Refunds and counts under "Total Refunds we owe".
 * No-op if the payable is already linked or isn't in the refund category.
 */
export async function linkPayableToRefundCase(
  supabase: SupabaseClient,
  payableId: string,
): Promise<string | null> {
  const { data: p } = await supabase
    .from("payables")
    .select("id, payee, description, amount, due_date, notes, source, invoice_ref, category_id, categories(name)")
    .eq("id", payableId)
    .maybeSingle();
  if (!p || p.source) return null;
  const cat = (p as unknown as { categories?: { name?: string } | null }).categories;
  if ((cat?.name ?? "").trim().toLowerCase() !== REFUND_CATEGORY_NAME.toLowerCase()) return null;

  const amount = Number(p.amount || 0);
  const received = p.due_date ? receivedDateFor(p.due_date) : null;
  const { data: claim, error } = await supabase
    .from("hrdc_claims")
    .insert({
      client_name: p.payee,
      refund_type: "other",
      claim_amount: amount,
      refund_amount_due: amount,
      hrdc_received_date: received,
      hrdc_amount_received: received ? amount : null,
      stage: received ? "client_refund_due" : "client_payment_received",
      notes: [p.description, p.notes].filter(Boolean).join(" — ") || "Created from Payables",
    })
    .select("id")
    .single();
  if (error || !claim) return null;

  await supabase
    .from("payables")
    .update({ source: "refund", invoice_ref: claim.id })
    .eq("id", p.id);
  return claim.id as string;
}

/**
 * The reverse direction: a linked payable was edited in Payables, so copy the
 * payee/amount onto its refund case. For non-HRDC cases the due date is also
 * carried over (via the "received" date) so a later sync doesn't reset it;
 * HRDC cases keep their real HRDC received date.
 */
export async function syncClaimFromPayable(
  supabase: SupabaseClient,
  claimId: string,
  p: { payee: string; amount: number; due_date: string },
): Promise<void> {
  const { data: claim } = await supabase
    .from("hrdc_claims")
    .select("refund_type")
    .eq("id", claimId)
    .maybeSingle();
  if (!claim) return;
  const update: Record<string, unknown> = {
    client_name: p.payee,
    claim_amount: p.amount,
    refund_amount_due: p.amount,
  };
  if (claim.refund_type !== "hrdc" && p.due_date) {
    update.hrdc_received_date = receivedDateFor(p.due_date);
    update.stage = "client_refund_due";
  }
  await supabase.from("hrdc_claims").update(update).eq("id", claimId);
}
