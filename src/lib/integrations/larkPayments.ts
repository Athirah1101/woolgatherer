// Builds the Wed/Fri "Payment Arrangement" message for Lark, shared by the cron
// and the manual "Post to Lark now" button so they always send the same thing.
//
// The list = payables the user has TICKED onto the arrangement board
// (arrangement = true) and not marked paid. Items flagged "On Hold" are shown
// separately and are NOT counted in the pay-now total. Unpaid items simply stay
// on the board, so anything not paid carries over to the next message.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Payable, HrdcClaim, HrdcRefund } from "@/lib/types";
import { formatMYR } from "@/lib/finance/money";
import { formatDate } from "@/lib/finance/dates";
import { owedAmount } from "@/lib/finance/payables";
import { refundSummary } from "@/lib/finance/hrdc";

const owing = (p: Payable) => p.status === "unpaid" || p.status === "partially_paid";
const orderKey = (p: Payable) => p.arrangement_order ?? Number.MAX_SAFE_INTEGER;

/**
 * Compose the payment-arrangement message. Returns null when nothing is on the
 * board (so the cron can skip sending an empty message).
 */
export async function buildPaymentArrangementMessage(
  client: SupabaseClient,
): Promise<string | null> {
  const [{ data: pay }, { data: banks }, { data: claims }, { data: refunds }] = await Promise.all([
    client.from("payables").select("*"),
    client.from("bank_accounts").select("account_name, current_balance, active"),
    client.from("hrdc_claims").select("*"),
    client.from("hrdc_refunds").select("*"),
  ]);

  const payables = (pay ?? []) as Payable[];
  // On the board, still owed, sorted by the manual order.
  const board = payables
    .filter((p) => p.arrangement && owing(p))
    .sort((a, b) => orderKey(a) - orderKey(b));
  if (board.length === 0) return null;

  const toPay = board.filter((p) => !p.arrangement_hold);
  const onHold = board.filter((p) => p.arrangement_hold);

  // Bank Balance Now = total across ACTIVE accounts.
  const bankNow = ((banks ?? []) as { current_balance: number | string; active: boolean }[])
    .filter((b) => b.active)
    .reduce((sum, b) => sum + Number(b.current_balance || 0), 0);

  const payTotal = toPay.reduce((sum, p) => sum + owedAmount(p), 0);
  const afterPayments = bankNow - payTotal;

  // Total Refunds we owe = remaining across all refund cases.
  const refByClaim = new Map<string, HrdcRefund[]>();
  for (const r of (refunds ?? []) as HrdcRefund[]) {
    const list = refByClaim.get(r.claim_id) ?? [];
    list.push(r);
    refByClaim.set(r.claim_id, list);
  }
  const refundsOwed = ((claims ?? []) as HrdcClaim[]).reduce(
    (sum, c) => sum + refundSummary(c, refByClaim.get(c.id) ?? []).remaining,
    0,
  );

  // Total Owings (Excluding Directors') = every still-owed payable that ISN'T a
  // director payback (is_payback). Board or not.
  const owingsExclDirectors = payables
    .filter((p) => owing(p) && !p.is_payback)
    .reduce((sum, p) => sum + owedAmount(p), 0);

  const line = (p: Payable, i: number) => {
    const note = p.arrangement_note?.trim();
    return `${i + 1}. ${p.payee} — ${formatMYR(owedAmount(p))}${note ? ` (${note})` : ""}`;
  };
  const holdLine = (p: Payable) => {
    const note = p.arrangement_note?.trim();
    return `• ${p.payee} — ${formatMYR(owedAmount(p))}${note ? ` (${note})` : ""}`;
  };

  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    "📋 FinanceOS — Payment Arrangement",
    formatDate(today),
    "",
    `Bank Balance Now ≈ ${formatMYR(bankNow)}`,
    "",
    "Payment Priority List:",
    ...(toPay.length ? toPay.map(line) : ["(none ticked yet)"]),
  ];

  if (onHold.length) {
    lines.push("", "⏸️ On Hold (not paying yet):", ...onHold.map(holdLine));
  }

  lines.push(
    "──────────────",
    `🚩 Bank Balance After Payments ≈ ${formatMYR(afterPayments)}`,
    `‼️ Total Refunds we owe ≈ ${formatMYR(refundsOwed)}`,
    `◻️ Total Owings (Excluding Directors') ≈ ${formatMYR(owingsExclDirectors)}`,
  );

  return lines.join("\n");
}
