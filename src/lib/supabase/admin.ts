import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for trusted server-side jobs (e.g. the daily
 * Stripe balance sync) that run with no user session and must bypass RLS.
 *
 * NEVER import this into client components or expose the key to the browser.
 * Requires SUPABASE_SERVICE_ROLE_KEY (set in the deployment environment only).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin client not configured — set SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
