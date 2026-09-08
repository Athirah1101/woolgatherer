// Stripe → FinanceOS balance sync.
//
// Reads the account's MYR balance from Stripe and writes it into the "Stripe"
// bank account so Dashboard "Current Cash" stays current without manual entry.
//
// Stripe returns amounts in the currency's smallest unit (sen for MYR) as
// integers; our bank_accounts.current_balance is stored in ringgit, so we
// convert with fromSen().

import { fromSen } from "@/lib/finance/money";
import { writeBankBalance } from "./bank-sync";

/** Which bank account (by name) the Stripe balance is written to. */
const STRIPE_ACCOUNT_NAME = "Stripe";
const STRIPE_CURRENCY = "myr";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

interface StripeBalanceLine {
  amount: number;
  currency: string;
}
interface StripeBalanceResponse {
  available?: StripeBalanceLine[];
  pending?: StripeBalanceLine[];
  error?: { message?: string };
}
interface StripePayout {
  amount?: number;
  currency?: string;
  status?: string;
}
interface StripePayoutList {
  data?: StripePayout[];
  error?: { message?: string };
}

export interface StripeSyncResult {
  /** Total MYR balance written, in ringgit. */
  balance: number;
  available: number; // ringgit
  pending: number; // ringgit
  inTransit: number; // ringgit — paid out, not yet in the bank
  asOf: string;
  detail?: string;
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
 * Sum MYR payouts that have LEFT the Stripe balance but haven't landed in the
 * bank yet (status pending or in_transit). Stripe drops these from `available`
 * the moment a payout is created, so without adding them back the money is
 * invisible — counted by neither Stripe nor the bank — until it arrives in CIMB.
 * Returns sen. Best-effort: a payouts failure never blocks the balance sync.
 */
async function fetchInTransitPayoutsSen(): Promise<number> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return 0;
  try {
    const res = await fetch("https://api.stripe.com/v1/payouts?limit=100", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    const body = (await res.json()) as StripePayoutList;
    if (!res.ok) return 0;
    return (body.data ?? [])
      .filter((p) => p.currency?.toLowerCase() === STRIPE_CURRENCY)
      .filter((p) => p.status === "pending" || p.status === "in_transit")
      .reduce((acc, p) => acc + (p.amount || 0), 0);
  } catch {
    return 0;
  }
}

/**
 * Fetch the Stripe MYR position and write it to the "Stripe" bank account.
 * Balance = available + pending + in-transit payouts — so money mid-way from
 * Stripe to the bank is still counted (it's real cash, just travelling), and
 * drops off once the payout lands in CIMB and the bank balance reflects it.
 * Throws with a human-readable message on any failure.
 */
export async function syncStripeBalance(): Promise<StripeSyncResult> {
  const [{ available: availSen, pending: pendSen }, inTransitSen] = await Promise.all([
    fetchStripeMyrBalanceSen(),
    fetchInTransitPayoutsSen(),
  ]);
  const balance = fromSen(availSen + pendSen + inTransitSen);
  const asOf = await writeBankBalance(STRIPE_ACCOUNT_NAME, balance);
  const parts = [`available ${fromSen(availSen)}`, `pending ${fromSen(pendSen)}`];
  if (inTransitSen > 0) parts.push(`in-transit ${fromSen(inTransitSen)}`);
  return {
    balance,
    available: fromSen(availSen),
    pending: fromSen(pendSen),
    inTransit: fromSen(inTransitSen),
    asOf,
    detail: parts.join(" + "),
  };
}
