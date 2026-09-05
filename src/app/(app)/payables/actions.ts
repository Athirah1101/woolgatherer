"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import type { ActionState } from "@/components/form";
import type { RecurringPayable } from "@/lib/types";
import { dueDatesForRule } from "@/lib/finance/payables";
import { endOfMonth, startOfMonth, todayISO, formatDate } from "@/lib/finance/dates";
import { formatMYR, subMoney, round2, toSen } from "@/lib/finance/money";
import { recordCashSnapshot } from "@/lib/data/cashHistory";
import { sendNotification } from "@/lib/integrations/email";
import { sendLark, larkConfigured } from "@/lib/integrations/lark";
import { buildPaymentArrangementMessage } from "@/lib/integrations/larkPayments";

async function financeGuard() {
  const session = await getSession();
  if (!session || session.profile.role !== "finance") throw new Error("Not authorised");
  return session;
}
const s = (fd: FormData, k: string) => (fd.get(k) as string | null)?.trim() ?? "";
const n = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return v ? Number(v) : 0;
};
function refresh() {
  revalidatePath("/payables");
  revalidatePath("/dashboard");
  revalidatePath("/cashflow");
}

/** Best-effort Lark ping when a new payable is added (never blocks the save). */
async function notifyNewPayable(payee: string, amount: number, dueDate: string, tag?: string) {
  try {
    if (!larkConfigured()) return;
    await sendLark(
      [
        `🧾 New payable added${tag ? ` ${tag}` : ""}`,
        `${payee} — ${formatMYR(amount)}`,
        `Due ${formatDate(dueDate)}`,
      ].join("\n"),
    );
  } catch {
    // ignore — a failed notification must never break creating the payable
  }
}

export async function savePayable(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const session = await financeGuard();
    const supabase = await createClient();
    const id = s(fd, "id");
    const payee = s(fd, "payee");
    const due_date = s(fd, "due_date");
    if (!payee || !due_date) return { error: "Payee and due date are required" };
    const payload = {
      payee,
      category_id: s(fd, "category_id") || null,
      description: s(fd, "description") || null,
      amount: n(fd, "amount"),
      due_date,
      payment_method_id: s(fd, "payment_method_id") || null,
      notes: s(fd, "notes") || null,
    };
    const res = id
      ? await supabase.from("payables").update(payload).eq("id", id)
      : await supabase.from("payables").insert(payload);
    if (res.error) return { error: res.error.message };
    await logActivity(supabase, {
      entity_type: "payable", entity_id: id || null, action: id ? "updated" : "created",
      actor: session.userId, summary: `${payee} — ${formatMYR(payload.amount)}`,
    });
    // Alert the Lark group when a brand-new payable is added (not on edits).
    if (!id) await notifyNewPayable(payee, payload.amount, due_date);
    refresh();
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** The payment method whose spending must be paid back to a person. */
const PAYBACK_METHOD = "Joseph Chua";

export async function markPayablePaid(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const session = await financeGuard();
    const supabase = await createClient();
    const id = s(fd, "id");
    if (!id) return { error: "Missing payable" };
    const amountNow = n(fd, "paid_amount"); // amount paid in THIS transaction
    const method_id = s(fd, "payment_method_id") || null;
    if (amountNow <= 0) return { error: "Enter the amount paid" };

    // Accumulate onto any previous partial payments; mark paid only once the
    // full amount is covered, otherwise "partially_paid".
    const { data: cur } = await supabase
      .from("payables").select("amount, paid_amount").eq("id", id).single();
    const totalPaid = round2(Number(cur?.paid_amount ?? 0) + amountNow);
    const fullyPaid = toSen(totalPaid) >= toSen(Number(cur?.amount ?? 0));

    const { error } = await supabase
      .from("payables")
      .update({
        status: fullyPaid ? "paid" : "partially_paid",
        paid_date: s(fd, "paid_date") || todayISO(),
        paid_amount: totalPaid,
        payment_method_id: method_id,
        reference: s(fd, "reference") || null,
      })
      .eq("id", id);
    if (error) return { error: error.message };
    await logActivity(supabase, {
      entity_type: "payable", entity_id: id, action: fullyPaid ? "marked_paid" : "partial_payment",
      actor: session.userId,
      summary: `${fullyPaid ? "Paid" : "Partial payment"} ${formatMYR(amountNow)}`,
    });

    // If this was paid via the "Joseph Chua" method, we now owe Joseph Chua
    // that amount — auto-create a payable to him so the debt is tracked.
    await maybeCreatePayback(supabase, session.userId, id, method_id, amountNow);

    // If paid via CIMB Bank Transfer, deduct the amount from the CIMB account.
    await maybeDeductFromBank(supabase, session.userId, method_id, amountNow);

    const remaining = Math.max(0, round2(Number(cur?.amount ?? 0) - totalPaid));
    const { data: paid } = await supabase.from("payables").select("payee").eq("id", id).single();
    await sendNotification(fullyPaid ? "Payable paid" : "Payable partial payment", [
      `${paid?.payee ?? "Payable"} — ${formatMYR(amountNow)} paid${fullyPaid ? "" : ` · ${formatMYR(remaining)} remaining`}`,
    ]);

    refresh();
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

async function maybeCreatePayback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  payableId: string,
  methodId: string | null,
  amount: number,
) {
  if (!methodId || amount <= 0) return;
  const { data: method } = await supabase
    .from("payment_methods").select("name").eq("id", methodId).single();
  if (!method || method.name?.toLowerCase() !== PAYBACK_METHOD.toLowerCase()) return;

  const { data: original } = await supabase
    .from("payables").select("payee").eq("id", payableId).single();
  // Don't create a payback for a payback (avoid a loop).
  if (original?.payee?.toLowerCase() === PAYBACK_METHOD.toLowerCase()) return;

  await supabase.from("payables").insert({
    payee: PAYBACK_METHOD,
    description: `Payback — paid ${original?.payee ?? "an expense"} via ${PAYBACK_METHOD}`,
    amount,
    due_date: todayISO(),
    status: "unpaid",
    is_payback: true,
    source_payable_id: payableId,
  });
  await logActivity(supabase, {
    entity_type: "payable", entity_id: null, action: "payback_created",
    actor: userId, summary: `Owe ${PAYBACK_METHOD} ${formatMYR(amount)}`,
  });
}

/** Payments made via this method are debited from the named bank account. */
const BANK_DEDUCT_METHOD = "CIMB Bank Transfer";
const BANK_DEDUCT_ACCOUNT = "Main Operating Account";

async function maybeDeductFromBank(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  methodId: string | null,
  amount: number,
) {
  if (!methodId || amount <= 0) return;
  const { data: method } = await supabase
    .from("payment_methods").select("name").eq("id", methodId).single();
  if (method?.name?.toLowerCase() !== BANK_DEDUCT_METHOD.toLowerCase()) return;

  const { data: acc } = await supabase
    .from("bank_accounts").select("id, current_balance").ilike("account_name", BANK_DEDUCT_ACCOUNT).single();
  if (!acc) return;

  const newBalance = subMoney(acc.current_balance as number, amount);
  await supabase.from("bank_accounts").update({ current_balance: newBalance }).eq("id", acc.id);
  await recordCashSnapshot(supabase);
  await logActivity(supabase, {
    entity_type: "bank_account", entity_id: acc.id, action: "auto_debit",
    actor: userId, summary: `−${formatMYR(amount)} from ${BANK_DEDUCT_ACCOUNT} (payable paid)`,
  });
  revalidatePath("/settings/bank-accounts");
  revalidatePath("/dashboard");
  revalidatePath("/cashflow");
}

// ---------------------------------------------------------------------------
// Payment-arrangement board (the Wed/Fri Lark list)
// ---------------------------------------------------------------------------

/** Add a payable to the arrangement board (appended to the bottom). */
export async function addToArrangement(fd: FormData): Promise<void> {
  await financeGuard();
  const supabase = await createClient();
  const id = s(fd, "id");
  if (!id) return;
  // Put new items at the end of the current order.
  const { data: rows } = await supabase
    .from("payables").select("arrangement_order").eq("arrangement", true);
  const max = Math.max(0, ...(rows ?? []).map((r) => Number(r.arrangement_order ?? 0)));
  await supabase
    .from("payables")
    .update({ arrangement: true, arrangement_order: max + 1 })
    .eq("id", id);
  refresh();
}

/** Remove a payable from the arrangement board (keeps its note/hold for later). */
export async function removeFromArrangement(fd: FormData): Promise<void> {
  await financeGuard();
  const supabase = await createClient();
  const id = s(fd, "id");
  if (!id) return;
  await supabase.from("payables").update({ arrangement: false }).eq("id", id);
  refresh();
}

/** Flip a board item between "will pay" and "On Hold" (excluded from the message). */
export async function setArrangementHold(id: string, hold: boolean): Promise<void> {
  await financeGuard();
  const supabase = await createClient();
  await supabase.from("payables").update({ arrangement_hold: hold }).eq("id", id);
  refresh();
}

/** Save the short per-line note shown in the Lark message, e.g. a reason. */
export async function setArrangementNote(id: string, note: string): Promise<void> {
  await financeGuard();
  const supabase = await createClient();
  await supabase
    .from("payables")
    .update({ arrangement_note: note.trim() || null })
    .eq("id", id);
  refresh();
}

/** Persist a new drag order for the board. */
export async function reorderArrangement(orderedIds: string[]): Promise<void> {
  await financeGuard();
  const supabase = await createClient();
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from("payables").update({ arrangement_order: i + 1 }).eq("id", id),
    ),
  );
  revalidatePath("/payables");
}

/** Manual "Post to Lark now" for the arrangement list (finance only). */
export async function postPaymentsToLarkNow(_: ActionState, _fd: FormData): Promise<ActionState> {
  try {
    await financeGuard();
    if (!larkConfigured()) {
      return { error: "Lark isn't set up yet — add LARK_WEBHOOK_URL in Vercel and redeploy." };
    }
    const supabase = await createClient();
    const text = await buildPaymentArrangementMessage(supabase);
    if (!text) return { error: "Nothing on the board yet — tick some payables into the list first." };
    const sent = await sendLark(text);
    if (!sent) return { error: "Lark rejected the message. Check the webhook URL and the 'FinanceOS' keyword." };
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function cancelPayable(fd: FormData): Promise<void> {
  await financeGuard();
  const supabase = await createClient();
  await supabase.from("payables").update({ status: "cancelled" }).eq("id", s(fd, "id"));
  refresh();
}

/** Confirm an auto-imported (email) invoice — clears the "Needs review" flag. */
export async function approveInvoice(fd: FormData): Promise<void> {
  await financeGuard();
  const supabase = await createClient();
  const id = s(fd, "id");
  if (!id) return;
  await supabase.from("payables").update({ needs_review: false }).eq("id", id);
  refresh();
}

/** Reject an auto-imported invoice — cancels it and clears the review flag. */
export async function rejectInvoice(fd: FormData): Promise<void> {
  await financeGuard();
  const supabase = await createClient();
  const id = s(fd, "id");
  if (!id) return;
  await supabase.from("payables").update({ status: "cancelled", needs_review: false }).eq("id", id);
  refresh();
}

export async function saveRecurring(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await financeGuard();
    const supabase = await createClient();
    const id = s(fd, "id");
    const name = s(fd, "name");
    if (!name) return { error: "Name is required" };
    const payload = {
      name,
      payee: s(fd, "payee") || null,
      category_id: s(fd, "category_id") || null,
      frequency: s(fd, "frequency") || "monthly",
      due_day: n(fd, "due_day") || 1,
      due_month: Number(s(fd, "due_month")) || null,
      default_amount: n(fd, "default_amount"),
      amount_type: s(fd, "amount_type") || "fixed",
      payment_method_id: s(fd, "payment_method_id") || null,
      start_date: s(fd, "start_date") || todayISO(),
      end_date: s(fd, "end_date") || null,
      active: fd.get("active") !== "false",
      notes: s(fd, "notes") || null,
    };
    const res = id
      ? await supabase.from("recurring_payables").update(payload).eq("id", id)
      : await supabase.from("recurring_payables").insert(payload);
    if (res.error) return { error: res.error.message };
    revalidatePath("/settings/recurring");
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Generate upcoming payable records from active recurring rules (idempotent). */
export async function generateRecurringPayables(): Promise<void> {
  const session = await financeGuard();
  const supabase = await createClient();
  const today = todayISO();
  const from = startOfMonth(today);
  const through = endOfMonth(today); // current month only

  const { data: rules } = await supabase
    .from("recurring_payables")
    .select("*")
    .eq("active", true);

  let created = 0;
  for (const rule of (rules ?? []) as RecurringPayable[]) {
    const dues = dueDatesForRule(rule, from, through);
    if (!dues.length) continue;
    const periodKeys = dues.map((d) => d.period_key);
    const { data: existing } = await supabase
      .from("payables")
      .select("period_key")
      .eq("recurring_rule_id", rule.id)
      .in("period_key", periodKeys);
    const have = new Set((existing ?? []).map((e) => e.period_key));
    const toInsert = dues
      .filter((d) => !have.has(d.period_key))
      .map((d) => ({
        payee: rule.payee ?? rule.name,
        category_id: rule.category_id,
        description: rule.name,
        amount: rule.default_amount,
        due_date: d.due_date,
        payment_method_id: rule.payment_method_id,
        status: "unpaid",
        recurring_rule_id: rule.id,
        period_key: d.period_key,
      }));
    if (toInsert.length) {
      const { error } = await supabase.from("payables").insert(toInsert);
      if (!error) created += toInsert.length;
    }
  }
  await logActivity(supabase, {
    entity_type: "recurring_payable", entity_id: null, action: "generated",
    actor: session.userId, summary: `${created} payable(s) generated`,
  });
  refresh();
  revalidatePath("/settings/recurring");
}
