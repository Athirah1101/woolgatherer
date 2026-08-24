// Runs every configured balance provider. A provider with no credentials is
// skipped (not an error), so the sync works with any subset configured.

import { stripeConfigured, syncStripeBalance } from "./stripe";
import { airwallexConfigured, syncAirwallexBalance } from "./airwallex";

export interface ProviderResult {
  provider: string;
  status: "ok" | "error" | "skipped";
  balance?: number;
  error?: string;
  detail?: string;
}

async function run(
  provider: string,
  configured: boolean,
  fn: () => Promise<{ balance: number; detail?: string }>,
): Promise<ProviderResult> {
  if (!configured) return { provider, status: "skipped" };
  try {
    const { balance, detail } = await fn();
    return { provider, status: "ok", balance, detail };
  } catch (e) {
    return { provider, status: "error", error: (e as Error).message };
  }
}

export async function syncAllBalances(): Promise<ProviderResult[]> {
  return Promise.all([
    run("Stripe", stripeConfigured(), syncStripeBalance),
    run("Airwallex", airwallexConfigured(), syncAirwallexBalance),
  ]);
}
