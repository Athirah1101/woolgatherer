// Shared helper: write a synced balance into a bank account by name.
// Used by the provider integrations (Stripe, Airwallex, …).

import { createAdminClient } from "@/lib/supabase/admin";
import { todayISO } from "@/lib/finance/dates";
import { round2 } from "@/lib/finance/money";

/** Update the named bank account's balance (ringgit). Returns the as-of date. */
export async function writeBankBalance(accountName: string, balance: number): Promise<string> {
  const asOf = todayISO();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bank_accounts")
    .update({ current_balance: round2(balance), balance_as_of: asOf })
    .ilike("account_name", accountName)
    .select("id");
  if (error) throw new Error(`Could not update ${accountName}: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`No bank account named "${accountName}" was found.`);
  }
  return asOf;
}
