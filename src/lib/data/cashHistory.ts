import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/finance/dates";

export interface CashPoint {
  day: string; // ISO date
  total: number; // ringgit
}

/**
 * Snapshot today's total cash (sum of active bank accounts) into cash_history.
 * One row per day — the latest value that day wins. Safe to call after any
 * balance change (manual update or automatic sync). Never throws.
 */
export async function recordCashSnapshot(client: SupabaseClient): Promise<void> {
  try {
    const { data } = await client.from("bank_accounts").select("current_balance, active");
    const total = (data ?? [])
      .filter((a: { active: boolean }) => a.active)
      .reduce((sum: number, a: { current_balance: number | string }) => sum + Number(a.current_balance || 0), 0);
    await client
      .from("cash_history")
      .upsert({ day: todayISO(), total: Math.round(total * 100) / 100, recorded_at: new Date().toISOString() }, { onConflict: "day" });
  } catch {
    /* snapshots are best-effort */
  }
}

/** All recorded daily cash totals, oldest first. */
export async function getCashHistory(): Promise<CashPoint[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("cash_history").select("day, total").order("day");
  return (data ?? []).map((r: { day: string; total: number | string }) => ({
    day: r.day,
    total: Number(r.total),
  }));
}
