"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import type { ActionState } from "@/components/form";
import { todayISO } from "@/lib/finance/dates";
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
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  revalidatePath("/cashflow");
}

export async function saveExpense(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const session = await financeGuard();
    const supabase = await createClient();
    const id = s(fd, "id");
    const vendor = s(fd, "vendor");
    if (!vendor) return { error: "Vendor is required" };
    const payload = {
      vendor,
      invoice_date: s(fd, "invoice_date") || null,
      received_date: s(fd, "received_date") || null,
      category_id: s(fd, "category_id") || null,
      department: s(fd, "department") || null,
      description: s(fd, "description") || null,
      amount: n(fd, "amount"),
      due_date: s(fd, "due_date") || null,
      notes: s(fd, "notes") || null,
    };
    let res;
    if (id) {
      res = await supabase.from("expenses").update(payload).eq("id", id);
    } else {
      res = await supabase
        .from("expenses")
        .insert({ ...payload, status: s(fd, "status") || "awaiting_payment" });
    }
    if (res.error) return { error: res.error.message };
    await logActivity(supabase, {
      entity_type: "expense", entity_id: id || null, action: id ? "updated" : "created",
      actor: session.userId, summary: `${vendor} — ${formatMYR(payload.amount)}`,
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function recordExpensePayment(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const session = await financeGuard();
    const supabase = await createClient();
    const id = s(fd, "id");
    if (!id) return { error: "Missing expense" };
    const { error } = await supabase
      .from("expenses")
      .update({
        status: "awaiting_verification", // recording payment moves it to verification
        paid_date: s(fd, "paid_date") || todayISO(),
        payment_method_id: s(fd, "payment_method_id") || null,
        reference: s(fd, "reference") || null,
      })
      .eq("id", id);
    if (error) return { error: error.message };
    await logActivity(supabase, {
      entity_type: "expense", entity_id: id, action: "payment_recorded", actor: session.userId,
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function verifyExpense(fd: FormData): Promise<void> {
  const session = await financeGuard();
  const supabase = await createClient();
  const id = (fd.get("id") as string) ?? "";
  await supabase
    .from("expenses")
    .update({ status: "verified", verified_by: session.userId, verified_date: todayISO() })
    .eq("id", id);
  await logActivity(supabase, {
    entity_type: "expense", entity_id: id, action: "verified", actor: session.userId,
  });
  refresh();
}

export async function cancelExpense(fd: FormData): Promise<void> {
  await financeGuard();
  const supabase = await createClient();
  await supabase.from("expenses").update({ status: "cancelled" }).eq("id", (fd.get("id") as string) ?? "");
  refresh();
}
