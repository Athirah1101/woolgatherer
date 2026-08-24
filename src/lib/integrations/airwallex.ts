// Airwallex → FinanceOS balance sync.
//
// Reads the MYR wallet balance from Airwallex and writes it into the
// "Airwallex" bank account. Airwallex returns amounts in MAJOR units
// (ringgit, e.g. 1582.92), so no sen conversion is needed.
//
// Auth is a two-step flow: POST /authentication/login with the client id +
// api key to get a short-lived bearer token, then call the balances endpoint.

import { writeBankBalance } from "./bank-sync";

const AIRWALLEX_BASE = "https://api.airwallex.com";
const AIRWALLEX_ACCOUNT_NAME = "Airwallex";
const AIRWALLEX_CURRENCY = "MYR";

export function airwallexConfigured(): boolean {
  return Boolean(process.env.AIRWALLEX_CLIENT_ID && process.env.AIRWALLEX_API_KEY);
}

interface AirwallexBalanceLine {
  currency?: string;
  available_amount?: number | string;
  pending_amount?: number | string;
  reserved_amount?: number | string;
  total_amount?: number | string;
}

async function getToken(): Promise<string> {
  const clientId = process.env.AIRWALLEX_CLIENT_ID;
  const apiKey = process.env.AIRWALLEX_API_KEY;
  if (!clientId || !apiKey) throw new Error("Airwallex credentials are not set.");

  const res = await fetch(`${AIRWALLEX_BASE}/api/v1/authentication/login`, {
    method: "POST",
    headers: { "x-client-id": clientId, "x-api-key": apiKey },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!res.ok || !body.token) {
    throw new Error(`Airwallex login failed: ${body.message ?? res.statusText}`);
  }
  return body.token;
}

const toNum = (v: number | string | undefined): number => (v == null ? 0 : Number(v) || 0);

export interface AirwallexSyncResult {
  balance: number;
  available: number;
  pending: number;
  asOf: string;
}

/**
 * Fetch the Airwallex MYR balance (available + pending) and write it to the
 * "Airwallex" bank account. Throws with a readable message on failure.
 */
export async function syncAirwallexBalance(): Promise<AirwallexSyncResult> {
  const token = await getToken();
  const res = await fetch(`${AIRWALLEX_BASE}/api/v1/balances/current`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body as { message?: string } | null)?.message ?? res.statusText;
    throw new Error(`Airwallex balance error: ${msg}`);
  }
  const lines = (Array.isArray(body) ? body : []) as AirwallexBalanceLine[];
  const myr = lines.find((l) => l.currency?.toUpperCase() === AIRWALLEX_CURRENCY);
  if (!myr) throw new Error("No MYR balance found on the Airwallex account.");

  const available = toNum(myr.available_amount);
  const pending = toNum(myr.pending_amount);
  const reserved = toNum(myr.reserved_amount);
  // Match the balance shown on the Airwallex dashboard: prefer their own
  // `total_amount`, otherwise sum available + pending + reserved (the API
  // omits total_amount for some accounts, which dropped the reserved portion).
  const balance = myr.total_amount != null ? toNum(myr.total_amount) : available + pending + reserved;
  const asOf = await writeBankBalance(AIRWALLEX_ACCOUNT_NAME, balance);
  return { balance, available, pending, asOf };
}
