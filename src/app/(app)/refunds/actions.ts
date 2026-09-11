"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { refundPayableDescription, refundPayableDue, syncRefundPayable } from "@/lib/data/refundPayable";
import type { ActionState } from "@/components/form";

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
function refresh() {
  revalidatePath("/refunds");
  revalidatePath("/hrdc");
  revalidatePath("/dashboard");
  revalidatePath("/cashflow");
}

/** Create/update a refund case (stored as an HRDC claim). */
export async function saveRefundCase(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const session = await financeGuard();
    const supabase = await createClient();
    const id = s(fd, "id");
    const client_name = s(fd, "client_name");
    if (!client_name) return { error: "Client name is required" };
    const received = d(fd, "hrdc_received_date");
    const claim_amount = numN(fd, "claim_amount");
    const refund_due = numN(fd, "refund_amount_due") ?? claim_amount;
    const payload = {
      client_name,
      notes: d(fd, "notes"),
      refund_type: s(fd, "refund_type") || "hrdc",
      amount_client_paid: numN(fd, "amount_client_paid"),
      claim_amount,
      hrdc_received_date: received,
      hrdc_amount_received: received ? numN(fd, "hrdc_amount_received") ?? claim_amount : null,
      refund_amount_due: refund_due,
      stage: received ? "client_refund_due" : "client_payment_received",
    };
    let claimId: string | null = id || null;
    if (id) {
      const { error } = await supabase.from("hrdc_claims").update(payload).eq("id", id);
      if (error) return { error: error.message };
      // Keep the mirror payable (amount/description/due) in step with the edit.
      await syncRefundPayable(supabase, id);
    } else {
      const { data: created, error } = await supabase
        .from("hrdc_claims").insert(payload).select("id").single();
      if (error || !created) return { error: error?.message ?? "Could not create refund case" };
      claimId = created.id;

      // Mirror the new refund into Payables so it shows up as money to pay out.
      // Tagged source="refund" so the cashflow, dashboard and Lark totals — which
      // already count HRDC refunds — don't double-count it.
      await supabase.from("payables").insert({
        payee: client_name,
        description: refundPayableDescription(payload.refund_type),
        amount: refund_due ?? 0,
        due_date: refundPayableDue(received),
        status: "unpaid",
        source: "refund",
        invoice_ref: claimId,
      });
    }
    revalidatePath("/payables");
    await logActivity(supabase, {
      entity_type: "hrdc_claim", entity_id: claimId, action: id ? "updated" : "created",
      actor: session.userId, summary: `${client_name} refund case`,
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
