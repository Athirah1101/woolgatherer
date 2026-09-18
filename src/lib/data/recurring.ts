import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecurringPayable } from "@/lib/types";
import { dueDatesForRule } from "@/lib/finance/payables";
import { startOfMonth, endOfMonth, todayISO } from "@/lib/finance/dates";

/**
 * Ensure the current month's payables exist for every active recurring rule.
 * Idempotent — skips period keys that already exist, and a partial unique index
 * on (recurring_rule_id, period_key) backstops against races. Safe to call on
 * every Payables page load. Returns how many new payables were created.
 */
export async function ensureRecurringForCurrentMonth(supabase: SupabaseClient): Promise<number> {
  const today = todayISO();
  const from = startOfMonth(today);
  const through = endOfMonth(today);

  const { data: rules } = await supabase.from("recurring_payables").select("*").eq("active", true);

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
  return created;
}
