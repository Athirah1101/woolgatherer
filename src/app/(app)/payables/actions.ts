"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import type { ActionState } from "@/components/form";
import type { RecurringPayable } from "@/lib/types";
import { dueDatesForRule } from "@/lib/finance/payables";
import { endOfMonth, startOfMonth, todayISO } from "@/lib/finance/dates";
import { formatMYR } from "@/lib/finance/money";

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
    refresh();
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function markPayablePaid(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const session = await financeGuard();
    const supabase = await createClient();
    const id = s(fd, "id");
    if (!id) return { error: "Missing payable" };
    const paid_amount = n(fd, "paid_amount");
    const { error } = await supabase
      .from("payables")
      .update({
        status: "paid",
        paid_date: s(fd, "paid_date") || todayISO(),
        paid_amount,
        payment_method_id: s(fd, "payment_method_id") || null,
        reference: s(fd, "reference") || null,
      })
      .eq("id", id);
    if (error) return { error: error.message };
    await logActivity(supabase, {
      entity_type: "payable", entity_id: id, action: "marked_paid",
      actor: session.userId, summary: `Paid ${formatMYR(paid_amount)}`,
    });
    refresh();
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
