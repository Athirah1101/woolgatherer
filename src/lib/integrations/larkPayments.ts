// Builds the Wed/Fri "Payment Arrangement" message for Lark, shared by the cron
// and the manual "Post to Lark now" button so they always send the same thing.
//
// The list = payables the user has TICKED onto the arrangement board
// (arrangement = true) and not marked paid. Items flagged "On Hold" are shown
// separately and are NOT counted in the pay-now total. Unpaid items simply stay
// on the board, so anything not paid carries over to the next message.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Payable, HrdcClaim, HrdcRefund } from "@/lib/types";
import { owedAmount } from "@/lib/finance/payables";

/**
 * Compact RM for the boss message: RM9.4k, RM3.7k, RM1mil, RM750.
 * Rounded to 1 decimal (trailing .0 dropped) — matches the WhatsApp shorthand.
 */
function rm(v: number): string {
  const neg = v < 0;
  const a = Math.abs(v);
  const trim = (x: number) => String(Math.round(x * 10) / 10);
  let out: string;
  if (a >= 1_000_000) out = `${trim(a / 1_000_000)}mil`;
  else if (a >= 1_000) out = `${trim(a / 1_000)}k`;
  else out = String(Math.round(a));
  return `${neg ? "-" : ""}RM${out}`;
}
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

  // Priority = will-pay-now: not on hold, not KIV. On-hold items stay on the
  // board but are left out of the message; KIV items go in their own section.
  const toPay = board.filter((p) => !p.arrangement_hold && !p.arrangement_kiv);
  const kivList = board.filter((p) => p.arrangement_kiv);

  // Bank Balance Now = CIMB (the "Main Operating Account") + Airwallex only —
  // the money actually available for this pay run (other accounts are kept aside).
  const BALANCE_ACCOUNTS = ["main operating account", "airwallex"];
  const bankNow = ((banks ?? []) as { account_name: string; current_balance: number | string }[])
    .filter((b) => BALANCE_ACCOUNTS.includes((b.account_name ?? "").trim().toLowerCase()))
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
    .filter((p) => owing(p) && !p.is_payback && p.source !== "refund")
    .reduce((sum, p) => sum + owedAmount(p), 0);

  const line = (p: Payable, i: number) => {
    const note = p.arrangement_note?.trim();
    // Prefer the description (e.g. "Ray & Edison EPF") over the bare payee ("EPF")
    // so the boss message names exactly which bill it is. Falls back to payee.
    const name = p.description?.trim() || p.payee;
    return `${i + 1}. ${name} - ${rm(owedAmount(p))}${note ? ` (${note})` : ""}`;
  };

  // Notes block: the user's saved general notes, verbatim (each line as typed).
  // Falls back to a single blank bullet so the section is never empty.
  const noteLines = notes ? notes.split(/\r?\n/).filter((l) => l.trim().length > 0) : [];

  const lines: string[] = [
    `*Bank Balance Now ≈ ${rm(bankNow)}*`,
    "",
    `*${nextSendDateLabel()} Payment Priority List:*`,
    "",
    ...(toPay.length ? toPay.map(line) : ["(none ticked yet)"]),
    ...(kivList.length ? ["", "*KIV (Keep In View):*", ...kivList.map(line)] : []),
    "",
    "*Notes:*",
    ...(noteLines.length ? noteLines : ["- "]),
    "",
    `🚨 *Bank Balance After Payments ≈ ${rm(afterPayments)}*`,
    `‼️ *Total Refunds we owe ≈ ${rm(refundsOwed)}*`,
    `🫪 *Total Owings (Excluding Directors') ≈ ${rm(owingsExclDirectors)}*`,
    "",
    "_FinanceOS_",
  ];

  return lines.join("\n");
}

/** "2026-09-11" -> "11/9/2026" */
function dmy(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}/${m}/${y}`;
}

/**
 * Compose the "Payments Made" recap for a given day: every payable whose
 * paid_date is that day, with amount + method and a running total. Returns null
 * when nothing was paid that day (so the cron can skip an empty message).
 */
export async function buildPaymentsMadeMessage(
  client: SupabaseClient,
  dateISO: string,
): Promise<string | null> {
  const [{ data: pays }, { data: methods }] = await Promise.all([
    client
      .from("payables")
      .select("payee, description, paid_amount, amount, status, payment_method_id")
      .eq("paid_date", dateISO)
      .in("status", ["paid", "partially_paid"]),
    client.from("payment_methods").select("id, name"),
  ]);

  const rows = (pays ?? []) as Payable[];
  if (rows.length === 0) return null;

  const methodName = new Map(
    ((methods ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]),
  );

  let total = 0;
  const lines = rows.map((p, i) => {
    const amt = Number(p.paid_amount ?? 0) || Number(p.amount ?? 0);
    total += amt;
    const name = p.description?.trim() || p.payee;
    const method = p.payment_method_id ? methodName.get(p.payment_method_id) : null;
    const partial = p.status === "partially_paid" ? " (partial)" : "";
    return `${i + 1}. ${name} - ${rm(amt)}${method ? ` · ${method}` : ""}${partial}`;
  });

  return [
    `✅ *Payments Made — ${dmy(dateISO)}*`,
    "",
    ...lines,
    "",
    `*Total Paid ≈ ${rm(total)}*`,
    "",
    "_FinanceOS_",
  ].join("\n");
}
