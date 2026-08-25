"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import type { ActionState } from "@/components/form";
import type { PaymentAllocation, PaymentSchedule, ReceivablePayment } from "@/lib/types";
import { allocatePayment, summarizeReceivable } from "@/lib/finance/receivables";
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

interface ScheduleInput {
  due_date: string;
  expected_amount: number;
}
function parseSchedule(raw: string): ScheduleInput[] {
  try {
    const rows = JSON.parse(raw) as ScheduleInput[];
    return rows
      .filter((r) => r && r.due_date && Number(r.expected_amount) > 0)
      .map((r) => ({ due_date: r.due_date, expected_amount: Number(r.expected_amount) }));
  } catch {
    return [];
  }
}

function refreshReceivableViews(id: string) {
  revalidatePath("/receivables");
  revalidatePath(`/receivables/${id}`);
  revalidatePath("/cashflow");
  revalidatePath("/dashboard");
}

export async function createReceivable(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const session = await financeGuard();
    const supabase = await createClient();
    const client_name = s(fd, "client_name");
    if (!client_name) return { error: "Client name is required" };

    const total = n(fd, "total_receivable") || n(fd, "original_amount");
    const rows = parseSchedule(s(fd, "schedule"));

    const { data: rec, error } = await supabase
      .from("receivables")
      .insert({
        client_name,
        contact_name: s(fd, "contact_name") || null,
        product: s(fd, "product") || null,
        sales_pic: s(fd, "sales_pic") || null,
        deal_date: s(fd, "deal_date") || null,
        original_amount: n(fd, "original_amount"),
        total_receivable: total,
        currency: "MYR",
        payment_plan_type: s(fd, "payment_plan_type") || "custom",
        hrdc_applicable: fd.get("hrdc_applicable") === "on",
        notes: s(fd, "notes") || null,
        remarks: s(fd, "remarks") || null,
        created_by: session.userId,
      })
      .select("id")
      .single();
    if (error || !rec) return { error: error?.message ?? "Could not create receivable" };

    if (rows.length) {
      const { error: schedErr } = await supabase.from("payment_schedules").insert(
        rows.map((r, i) => ({
          receivable_id: rec.id,
          due_date: r.due_date,
          expected_amount: r.expected_amount,
          sort_order: i,
        })),
      );
      if (schedErr) return { error: schedErr.message };
    }

    await logActivity(supabase, {
      entity_type: "receivable",
      entity_id: rec.id,
      action: "created",
      actor: session.userId,
      summary: `${client_name} — ${formatMYR(total)}`,
    });
    refreshReceivableViews(rec.id);
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function updateReceivable(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const session = await financeGuard();
    const supabase = await createClient();
    const id = s(fd, "id");
    if (!id) return { error: "Missing receivable" };
    const { error } = await supabase
      .from("receivables")
      .update({
        client_name: s(fd, "client_name"),
        contact_name: s(fd, "contact_name") || null,
        product: s(fd, "product") || null,
        sales_pic: s(fd, "sales_pic") || null,
        deal_date: s(fd, "deal_date") || null,
        original_amount: n(fd, "original_amount"),
        total_receivable: n(fd, "total_receivable"),
        hrdc_applicable: fd.get("hrdc_applicable") === "on",
        status: s(fd, "status") || "active",
        notes: s(fd, "notes") || null,
        remarks: s(fd, "remarks") || null,
      })
      .eq("id", id);
    if (error) return { error: error.message };
    await logActivity(supabase, {
      entity_type: "receivable", entity_id: id, action: "updated", actor: session.userId,
    });
    refreshReceivableViews(id);
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const RECV_STATUSES = ["active","completed","cancelled","on_hold","stopped","on_time","delayed","cleared","others"];

/** Quick inline status change from the main receivables table. */
export async function updateReceivableStatus(id: string, status: string): Promise<void> {
  const session = await financeGuard();
  if (!id || !RECV_STATUSES.includes(status)) return;
  const supabase = await createClient();
  await supabase.from("receivables").update({ status }).eq("id", id);
  await logActivity(supabase, {
    entity_type: "receivable", entity_id: id, action: "status_updated",
    actor: session.userId, summary: `Status → ${status}`,
  });
  refreshReceivableViews(id);
}

export async function saveScheduleRow(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await financeGuard();
    const supabase = await createClient();
    const receivable_id = s(fd, "receivable_id");
    const id = s(fd, "id");
    const due_date = s(fd, "due_date");
    const expected_amount = n(fd, "expected_amount");
    if (!due_date || expected_amount <= 0) return { error: "Enter a due date and amount" };
    const payload = { receivable_id, due_date, expected_amount, notes: s(fd, "notes") || null };
    const res = id
      ? await supabase.from("payment_schedules").update(payload).eq("id", id)
      : await supabase.from("payment_schedules").insert(payload);
    if (res.error) return { error: res.error.message };
    refreshReceivableViews(receivable_id);
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteScheduleRow(fd: FormData): Promise<void> {
  await financeGuard();
  const supabase = await createClient();
  const id = s(fd, "id");
  const receivable_id = s(fd, "receivable_id");
  // Only allow deleting a schedule with no allocations against it.
  const { data: allocs } = await supabase
    .from("payment_allocations")
    .select("id")
    .eq("schedule_id", id)
    .limit(1);
  if (!allocs || allocs.length === 0) {
    await supabase.from("payment_schedules").delete().eq("id", id);
    refreshReceivableViews(receivable_id);
  }
}

export async function recordPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const session = await financeGuard();
    const supabase = await createClient();
    const receivable_id = s(fd, "receivable_id");
    const amount = n(fd, "amount");
    const received_date = s(fd, "received_date") || todayISO();
    if (!receivable_id || amount <= 0) return { error: "Enter a valid amount" };

    // Load current schedules + existing (non-voided) allocations to allocate against.
    const { data: schedules } = await supabase
      .from("payment_schedules")
      .select("*")
      .eq("receivable_id", receivable_id);
    const { data: existingPayments } = await supabase
      .from("receivable_payments")
      .select("id, voided")
      .eq("receivable_id", receivable_id);
    const livePayIds = (existingPayments ?? []).filter((p) => !p.voided).map((p) => p.id);
    const { data: existingAllocs } = livePayIds.length
      ? await supabase.from("payment_allocations").select("*").in("payment_id", livePayIds)
      : { data: [] as PaymentAllocation[] };

    const { allocations, credit } = allocatePayment(
      amount,
      (schedules ?? []) as PaymentSchedule[],
      (existingAllocs ?? []) as PaymentAllocation[],
      s(fd, "target_schedule_id") || null,
    );

    const { data: payment, error: payErr } = await supabase
      .from("receivable_payments")
      .insert({
        receivable_id,
        amount,
        received_date,
        payment_method_id: s(fd, "payment_method_id") || null,
        reference: s(fd, "reference") || null,
        notes: s(fd, "notes") || null,
        created_by: session.userId,
      })
      .select("id")
      .single();
    if (payErr || !payment) return { error: payErr?.message ?? "Could not record payment" };

    if (allocations.length) {
      const { error: allocErr } = await supabase.from("payment_allocations").insert(
        allocations.map((a) => ({ payment_id: payment.id, schedule_id: a.schedule_id, amount: a.amount })),
      );
      if (allocErr) return { error: allocErr.message };
    }

    // Auto-complete the deal if nothing is outstanding.
    const allPays = [
      ...((existingPayments ?? []).map((p) => ({ ...p })) as unknown as ReceivablePayment[]),
      { id: payment.id, voided: false } as ReceivablePayment,
    ];
    const { data: freshAllocs } = await supabase
      .from("payment_allocations")
      .select("*")
      .in("payment_id", allPays.filter((p) => !p.voided).map((p) => p.id));
    const summary = summarizeReceivable(
      (schedules ?? []) as PaymentSchedule[],
      allPays,
      (freshAllocs ?? []) as PaymentAllocation[],
      todayISO(),
    );
    const newStatus = summary.totalExpected > 0 && summary.outstanding <= 0 ? "completed" : "active";
    await supabase.from("receivables").update({ status: newStatus }).eq("id", receivable_id);

    await logActivity(supabase, {
      entity_type: "receivable",
      entity_id: receivable_id,
      action: "payment_recorded",
      actor: session.userId,
      summary: `${formatMYR(amount)} received${credit > 0 ? ` (${formatMYR(credit)} credit)` : ""}`,
      new_value: { amount, received_date, credit },
    });
    refreshReceivableViews(receivable_id);
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function voidPayment(fd: FormData): Promise<void> {
  const session = await financeGuard();
  const supabase = await createClient();
  const id = s(fd, "id");
  const receivable_id = s(fd, "receivable_id");
  await supabase.from("receivable_payments").update({ voided: true }).eq("id", id);
  await logActivity(supabase, {
    entity_type: "receivable", entity_id: receivable_id, action: "payment_voided", actor: session.userId,
  });
  refreshReceivableViews(receivable_id);
}
