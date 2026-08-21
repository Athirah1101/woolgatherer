"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
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
      amount_client_paid: numN(fd, "amount_client_paid"),
      claim_amount,
      hrdc_received_date: received,
      hrdc_amount_received: received ? numN(fd, "hrdc_amount_received") ?? claim_amount : null,
      refund_amount_due: refund_due,
      stage: received ? "client_refund_due" : "client_payment_received",
    };
    const res = id
      ? await supabase.from("hrdc_claims").update(payload).eq("id", id)
      : await supabase.from("hrdc_claims").insert(payload);
    if (res.error) return { error: res.error.message };
    await logActivity(supabase, {
      entity_type: "hrdc_claim", entity_id: id || null, action: id ? "updated" : "created",
      actor: session.userId, summary: `${client_name} refund case`,
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
