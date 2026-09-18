import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecurringPayable } from "@/lib/types";
import { dueDatesForRule } from "@/lib/finance/payables";
import { startOfMonth, endOfMonth, todayISO } from "@/lib/finance/dates";

/**
 * Ensure the current month's payables exist for every active recurring rule.
 * Idempotent — a partial unique index on (recurring_rule_id, period_key) plus
 * `on conflict do nothing` means it's safe to call on every Payables page load.
 * Returns how many new payables were created.
 */
export async function ensureRecurringForCurrentMonth(supabase: SupabaseClient): Promise<number> {
  const today = todayISO();
  const from = startOfMonth(today);
  const through = endOfMonth(today);

  const { data: rules } = await supabase.from("recurring_payables").select("*").eq("active", true);

  const toInsert: Record<string, unknown>[] = [];
  for (const rule of (rules ?? []) as RecurringPayable[]) {
    for (const d of dueDatesForRule(rule, from, through)) {
      toInsert.push({
        payee: rule.payee ?? rule.name,
        category_id: rule.category_id,
        description: rule.name,
        amount: rule.default_amount,
        due_date: d.due_date,
        payment_method_id: rule.payment_method_id,
        status: "unpaid",
        recurring_rule_id: rule.id,
        period_key: d.period_key,
      });
    }
  }
  if (toInsert.length === 0) return 0;

  // Rows that already exist are skipped by the unique index.
  const { data, error } = await supabase
    .from("payables")
    .upsert(toInsert, { onConflict: "recurring_rule_id,period_key", ignoreDuplicates: true })
    .select("id");
  if (error) return 0;
  return data?.length ?? 0;
}
