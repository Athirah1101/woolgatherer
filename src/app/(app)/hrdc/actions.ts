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
const d = (fd: FormData, k: string) => s(fd, k) || null;
const numN = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return v !== null && v !== "" ? Number(v) : null;
};
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";

function refresh(id?: string) {
  revalidatePath("/hrdc");
  if (id) revalidatePath(`/hrdc/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/cashflow");
}

export async function createHrdcClaim(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const session = await financeGuard();
    const supabase = await createClient();
    const client_name = s(fd, "client_name");
    if (!client_name) return { error: "Client is required" };
    const { data, error } = await supabase
      .from("hrdc_claims")
      .insert({
        receivable_id: d(fd, "receivable_id"),
        client_name,
        contact_name: d(fd, "contact_name"),
        product: d(fd, "product"),
        sales_pic: d(fd, "sales_pic"),
        amount_client_paid: numN(fd, "amount_client_paid"),
        claim_amount: numN(fd, "claim_amount"),
        grant_application_date: d(fd, "grant_application_date"),
        notes: d(fd, "notes"),
      })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "Could not create claim" };
    await logActivity(supabase, {
      entity_type: "hrdc_claim", entity_id: data.id, action: "created",
      actor: session.userId, summary: `${client_name} HRDC claim`,
    });
    refresh(data.id);
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function updateHrdcClaim(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const session = await financeGuard();
    const supabase = await createClient();
    const id = s(fd, "id");
    if (!id) return { error: "Missing claim" };
    const { error } = await supabase
      .from("hrdc_claims")
      .update({
        client_name: s(fd, "client_name"),
        contact_name: d(fd, "contact_name"),
        product: d(fd, "product"),
        sales_pic: d(fd, "sales_pic"),
        amount_client_paid: numN(fd, "amount_client_paid"),
        claim_amount: numN(fd, "claim_amount"),
        approved_amount: numN(fd, "approved_amount"),
        grant_application_date: d(fd, "grant_application_date"),
        grant_reference: d(fd, "grant_reference"),
        grant_approval_date: d(fd, "grant_approval_date"),
        grant_status: d(fd, "grant_status"),
        training_start_date: d(fd, "training_start_date"),
        training_end_date: d(fd, "training_end_date"),
        documents_complete: bool(fd, "documents_complete"),
        documents_collected_date: d(fd, "documents_collected_date"),
        claim_submitted_date: d(fd, "claim_submitted_date"),
        claim_status: d(fd, "claim_status"),
        claim_approved_date: d(fd, "claim_approved_date"),
        grant_approval_notification_sent: bool(fd, "grant_approval_notification_sent"),
        refund_processing_notification_sent: bool(fd, "refund_processing_notification_sent"),
        notes: d(fd, "notes"),
      })
      .eq("id", id);
    if (error) return { error: error.message };
    await logActivity(supabase, {
      entity_type: "hrdc_claim", entity_id: id, action: "updated", actor: session.userId,
    });
    refresh(id);
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Record HRD Corp funds received — this starts the 30-day refund countdown. */
export async function recordHrdcPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const session = await financeGuard();
    const supabase = await createClient();
    const id = s(fd, "id");
    const amount = numN(fd, "hrdc_amount_received");
    const received = s(fd, "hrdc_received_date") || todayISO();
    if (!id || !amount || amount <= 0) return { error: "Enter the amount received" };
    // Refund due to client defaults to the amount received unless specified.
    const refundDue = numN(fd, "refund_amount_due") ?? amount;
    const { error } = await supabase
      .from("hrdc_claims")
      .update({
        hrdc_amount_received: amount,
        hrdc_received_date: received,
        refund_amount_due: refundDue,
        stage: "client_refund_due",
      })
      .eq("id", id);
    if (error) return { error: error.message };
    await logActivity(supabase, {
      entity_type: "hrdc_claim", entity_id: id, action: "hrdc_payment_recorded",
      actor: session.userId,
      summary: `Received ${formatMYR(amount)} on ${received} — refund due within 30 days`,
      new_value: { hrdc_amount_received: amount, hrdc_received_date: received, refund_amount_due: refundDue },
    });
    refresh(id);
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Record a client refund (partial refunds supported). */
export async function recordRefund(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const session = await financeGuard();
    const supabase = await createClient();
    const claim_id = s(fd, "claim_id");
    const amount = numN(fd, "amount");
    if (!claim_id || !amount || amount <= 0) return { error: "Enter the refund amount" };
    const { error } = await supabase.from("hrdc_refunds").insert({
      claim_id,
      amount,
      refund_date: s(fd, "refund_date") || todayISO(),
      payment_method_id: d(fd, "payment_method_id"),
      reference: d(fd, "reference"),
      notes: d(fd, "notes"),
      created_by: session.userId,
    });
    if (error) return { error: error.message };
    await logActivity(supabase, {
      entity_type: "hrdc_claim", entity_id: claim_id, action: "refund_recorded",
      actor: session.userId, summary: `Refunded ${formatMYR(amount)} to client`,
    });
    refresh(claim_id);
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Log an HRD Corp query — reply deadline auto-derives as +5 calendar days. */
export async function recordQuery(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const session = await financeGuard();
    const supabase = await createClient();
    const id = s(fd, "id");
    if (!id) return { error: "Missing claim" };
    const replied = s(fd, "query_replied_date");
    const { error } = await supabase
      .from("hrdc_claims")
      .update({
        query_received: true,
        query_received_date: s(fd, "query_received_date") || todayISO(),
        query_details: d(fd, "query_details"),
        query_replied_date: replied || null,
      })
      .eq("id", id);
    if (error) return { error: error.message };
    await logActivity(supabase, {
      entity_type: "hrdc_claim", entity_id: id, action: "query_logged", actor: session.userId,
    });
    refresh(id);
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
