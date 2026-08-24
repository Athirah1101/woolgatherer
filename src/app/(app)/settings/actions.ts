"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import type { ActionState } from "@/components/form";
import { syncAllBalances } from "@/lib/integrations/balances";
import { formatMYR } from "@/lib/finance/money";
import { recordCashSnapshot } from "@/lib/data/cashHistory";

async function requireFinance() {
  const session = await getSession();
  if (!session || session.profile.role !== "finance") {
    throw new Error("Not authorised");
  }
  return session;
}

function str(fd: FormData, k: string): string {
  return (fd.get(k) as string | null)?.trim() ?? "";
}
function num(fd: FormData, k: string): number {
  const v = fd.get(k);
  return v ? Number(v) : 0;
}

export async function saveCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireFinance();
    const supabase = await createClient();
    const id = str(fd, "id");
    const name = str(fd, "name");
    if (!name) return { error: "Name is required" };
    const payload = { name, kind: str(fd, "kind") || "expense", active: fd.get("active") !== "false" };
    const res = id
      ? await supabase.from("categories").update(payload).eq("id", id)
      : await supabase.from("categories").insert(payload);
    if (res.error) return { error: res.error.message };
    revalidatePath("/settings/categories");
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function savePaymentMethod(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireFinance();
    const supabase = await createClient();
    const id = str(fd, "id");
    const name = str(fd, "name");
    if (!name) return { error: "Name is required" };
    const payload = { name, active: fd.get("active") !== "false" };
    const res = id
      ? await supabase.from("payment_methods").update(payload).eq("id", id)
      : await supabase.from("payment_methods").insert(payload);
    if (res.error) return { error: res.error.message };
    revalidatePath("/settings/payment-methods");
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function saveBankAccount(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const session = await requireFinance();
    const supabase = await createClient();
    const id = str(fd, "id");
    const name = str(fd, "account_name");
    if (!name) return { error: "Account name is required" };
    const payload = {
      account_name: name,
      bank: str(fd, "bank") || null,
      current_balance: num(fd, "current_balance"),
      balance_as_of: str(fd, "balance_as_of") || null,
      active: fd.get("active") !== "false",
    };
    const res = id
      ? await supabase.from("bank_accounts").update(payload).eq("id", id)
      : await supabase.from("bank_accounts").insert(payload);
    if (res.error) return { error: res.error.message };
    await logActivity(supabase, {
      entity_type: "bank_account",
      entity_id: id || null,
      action: id ? "updated" : "created",
      actor: session.userId,
      summary: `${name} balance ${payload.current_balance}`,
    });
    await recordCashSnapshot(supabase);
    revalidatePath("/settings/bank-accounts");
    revalidatePath("/dashboard");
    revalidatePath("/cashflow");
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Manually pull the latest balances from every configured provider. */
export async function syncBalancesNow(_: ActionState, _fd: FormData): Promise<ActionState> {
  try {
    const session = await requireFinance();
    const results = await syncAllBalances();

    // Human summary of EVERY provider (ok / error / not configured) — shown in
    // the UI and written to the audit log so issues are diagnosable.
    const summary = results
      .map((r) =>
        r.status === "ok"
          ? `${r.provider} ✓ ${formatMYR(r.balance ?? 0)}${r.detail ? ` ${r.detail}` : ""}`
          : r.status === "skipped"
            ? `${r.provider}: not configured`
            : `${r.provider} ⚠ ${r.error}`,
      )
      .join("  ·  ");

    const anyOk = results.some((r) => r.status === "ok");
    const anyProblem = results.some((r) => r.status !== "ok");

    // Best-effort audit log — never let logging break the sync result.
    try {
      const supabase = await createClient();
      await logActivity(supabase, {
        entity_type: "bank_account",
        entity_id: null,
        action: "balances_synced",
        actor: session.userId,
        summary,
      });
    } catch {
      /* ignore logging failures */
    }

    if (anyOk) {
      revalidatePath("/settings/bank-accounts");
      revalidatePath("/dashboard");
      revalidatePath("/cashflow");
    }

    // Show the full per-provider summary whenever anything isn't OK, so the
    // exact culprit (bad key, wrong currency, missing config) is visible.
    if (anyProblem) return { error: summary };
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function saveUserAccess(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireFinance();
    const supabase = await createClient();
    const id = str(fd, "id");
    if (!id) return { error: "Missing user" };
    const role = str(fd, "role");
    const payload = {
      role,
      sales_pic: role === "sales" ? str(fd, "sales_pic") || null : null,
      full_name: str(fd, "full_name") || null,
      active: fd.get("active") !== "false",
    };
    const res = await supabase.from("profiles").update(payload).eq("id", id);
    if (res.error) return { error: res.error.message };
    revalidatePath("/settings/users");
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
