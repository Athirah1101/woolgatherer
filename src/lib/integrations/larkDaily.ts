// Builds the daily cash-balance message text, shared by the noon cron and the
// manual "Post to Lark now" button so they always send the same thing.

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMYR } from "@/lib/finance/money";
import { formatDate, formatTime } from "@/lib/finance/dates";

interface BankRow {
  account_name: string;
  current_balance: number | string;
  active: boolean;
  sort_order: number | null;
  updated_at: string | null;
}

/** Query bank accounts and compose the Lark message. Returns null if none. */
export async function buildDailyBalanceMessage(client: SupabaseClient): Promise<string | null> {
  const { data } = await client
    .from("bank_accounts")
    .select("account_name, current_balance, active, sort_order, updated_at")
    .order("sort_order", { ascending: true });

  const accounts = (data ?? []) as BankRow[];
  if (accounts.length === 0) return null;

  const total = accounts
    .filter((a) => a.active)
    .reduce((sum, a) => sum + Number(a.current_balance || 0), 0);
  const latest = accounts
    .map((a) => a.updated_at)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);

  return [
    "💰 FinanceOS — Daily Cash Balance",
    formatDate(new Date().toISOString().slice(0, 10)),
    "",
    ...accounts.map(
      (a) => `${a.account_name}: ${formatMYR(a.current_balance)}${a.active ? "" : " (inactive)"}`,
    ),
    "──────────────",
    `Total Cash: ${formatMYR(total)}`,
    ...(latest ? [`(as of ${formatTime(latest)})`] : []),
  ].join("\n");
}
