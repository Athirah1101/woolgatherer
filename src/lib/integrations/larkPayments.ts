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
import { owedAmount } from "@/lib/finance/payables";
import { refundSummary } from "@/lib/finance/hrdc";

const owing = (p: Payable) => p.status === "unpaid" || p.status === "partially_paid";
const orderKey = (p: Payable) => p.arrangement_order ?? Number.MAX_SAFE_INTEGER;

/**
 * The date the list is "for": the upcoming (or today's) Wednesday or Friday, in
 * Malaysia time (UTC+8), formatted D/M/YYYY (e.g. 2/9/2026).
 */
export function nextSendDateLabel(): string {
  const myt = new Date(Date.now() + 8 * 3600 * 1000); // shift to MYT wall clock
  const dow = myt.getUTCDay(); // 0=Sun … 3=Wed, 5=Fri
  let addDays = 0;
  if (dow !== 3 && dow !== 5) {
    const toWed = (3 - dow + 7) % 7 || 7;
    const toFri = (5 - dow + 7) % 7 || 7;
    addDays = Math.min(toWed, toFri);
  }
  const d = new Date(myt.getTime() + addDays * 86400 * 1000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}

/**
 * Compose the payment-arrangement message. Returns null when nothing is on the
 * board (so the cron can skip sending an empty message).
 */
export async function buildPaymentArrangementMessage(
  client: SupabaseClient,
): Promise<string | null> {
  const [{ data: pay }, { data: banks }, { data: claims }, { data: refunds }, { data: notesRow }] = await Promise.all([
    client.from("payables").select("*"),
    client.from("bank_accounts").select("account_name, current_balance, active"),
    client.from("hrdc_claims").select("*"),
    client.from("hrdc_refunds").select("*"),
    client.from("app_settings").select("value").eq("key", "arrangement_notes").maybeSingle(),
  ]);
  const notes = ((notesRow?.value as string | undefined) ?? "").trim();

  const payables = (pay ?? []) as Payable[];
  // On the board, still owed, sorted by the manual order.
  const board = payables
    .filter((p) => p.arrangement && owing(p))
    .sort((a, b) => orderKey(a) - orderKey(b));
  if (board.length === 0) return null;

  // On-hold items stay on the board but are left out of the sent message.
  const toPay = board.filter((p) => !p.arrangement_hold);

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
    return `${i + 1}. ${p.payee} - ${formatMYR(owedAmount(p))}${note ? ` (${note})` : ""}`;
  };

  // Notes block: the user's saved general notes, verbatim (each line as typed).
  // Falls back to a single blank bullet so the section is never empty.
  const noteLines = notes ? notes.split(/\r?\n/).filter((l) => l.trim().length > 0) : [];

  const lines: string[] = [
    `*Bank Balance Now ≈ ${formatMYR(bankNow)}*`,
    "",
    `*${nextSendDateLabel()} Payment Priority List:*`,
    "",
    ...(toPay.length ? toPay.map(line) : ["(none ticked yet)"]),
    "",
    "*Notes:*",
    ...(noteLines.length ? noteLines : ["- "]),
    "",
    `🚨 *Bank Balance After Payments ≈ ${formatMYR(afterPayments)}*`,
    `‼️ *Total Refunds we owe ≈ ${formatMYR(refundsOwed)}*`,
    `🫪 *Total Owings (Excluding Directors') ≈ ${formatMYR(owingsExclDirectors)}*`,
    "",
    "_FinanceOS_",
  ];

  return lines.join("\n");
}
