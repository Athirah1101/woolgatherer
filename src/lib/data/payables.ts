import { createClient } from "@/lib/supabase/server";
import type { Payable, RecurringPayable } from "@/lib/types";
import { payableAttention, type PayableAttention } from "@/lib/finance/payables";
import { todayISO } from "@/lib/finance/dates";

export interface PayableRow {
  payable: Payable;
  attention: PayableAttention;
}

export async function getPayableRows(): Promise<PayableRow[]> {
  const supabase = await createClient();
  const today = todayISO();
  const { data } = await supabase
    .from("payables")
    .select("*")
    .order("due_date", { ascending: true });
  return ((data ?? []) as Payable[]).map((p) => ({
    payable: p,
    attention: payableAttention(p, today),
  }));
}

export async function getRecurringRules(): Promise<RecurringPayable[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recurring_payables")
    .select("*")
    .order("name");
  return (data ?? []) as RecurringPayable[];
}

export interface RecurringDetail {
  rule: RecurringPayable;
  payables: Payable[];
}

/** A recurring rule plus every payable it has generated (newest first). */
export async function getRecurringDetail(id: string): Promise<RecurringDetail | null> {
  const supabase = await createClient();
  const { data: rule } = await supabase
    .from("recurring_payables").select("*").eq("id", id).single();
  if (!rule) return null;
  const { data: payables } = await supabase
    .from("payables").select("*").eq("recurring_rule_id", id).order("due_date", { ascending: false });
  return { rule: rule as RecurringPayable, payables: (payables ?? []) as Payable[] };
}
