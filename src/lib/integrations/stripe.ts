// Stripe → FinanceOS balance sync.
//
// Reads the account's MYR balance from Stripe and writes it into the "Stripe"
// bank account so Dashboard "Current Cash" stays current without manual entry.
//
// Stripe returns amounts in the currency's smallest unit (sen for MYR) as
// integers; our bank_accounts.current_balance is stored in ringgit, so we
// convert with fromSen().

import { createAdminClient } from "@/lib/supabase/admin";
import { fromSen } from "@/lib/finance/money";
import { todayISO } from "@/lib/finance/dates";

/** Which bank account (by name) the Stripe balance is written to. */
const STRIPE_ACCOUNT_NAME = "Stripe";
const STRIPE_CURRENCY = "myr";

interface StripeBalanceLine {
  amount: number;
  currency: string;
}
interface StripeBalanceResponse {
  available?: StripeBalanceLine[];
  pending?: StripeBalanceLine[];
  error?: { message?: string };
}

export interface StripeSyncResult {
  /** Total MYR balance written, in ringgit. */
  balance: number;
  available: number; // ringgit
  pending: number; // ringgit
  asOf: string;
}

function sumCurrency(lines: StripeBalanceLine[] | undefined, currency: string): number {
  return (lines ?? [])
    .filter((l) => l.currency?.toLowerCase() === currency)
    .reduce((acc, l) => acc + (l.amount || 0), 0);
}

/** Fetch the MYR balance (in sen) from Stripe. Throws on any failure. */
async function fetchStripeMyrBalanceSen(): Promise<{ available: number; pending: number }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");

  const res = await fetch("https://api.stripe.com/v1/balance", {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  const body = (await res.json()) as StripeBalanceResponse;
  if (!res.ok) {
    throw new Error(`Stripe error: ${body.error?.message ?? res.statusText}`);
  }
  return {
    available: sumCurrency(body.available, STRIPE_CURRENCY),
    pending: sumCurrency(body.pending, STRIPE_CURRENCY),
  };
}

/**
 * Fetch the Stripe MYR balance and write it to the "Stripe" bank account.
 * The stored balance = available + pending (the full MYR balance Stripe holds).
 * Throws with a human-readable message on any failure.
 */
export async function syncStripeBalance(): Promise<StripeSyncResult> {
  const { available: availSen, pending: pendSen } = await fetchStripeMyrBalanceSen();
  const totalSen = availSen + pendSen;

  const balance = fromSen(totalSen);
  const asOf = todayISO();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bank_accounts")
    .update({ current_balance: balance, balance_as_of: asOf })
    .ilike("account_name", STRIPE_ACCOUNT_NAME)
    .select("id");
  if (error) throw new Error(`Could not update Stripe account: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`No bank account named "${STRIPE_ACCOUNT_NAME}" was found.`);
  }

  return { balance, available: fromSen(availSen), pending: fromSen(pendSen), asOf };
}
