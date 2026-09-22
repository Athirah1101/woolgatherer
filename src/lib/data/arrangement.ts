import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayISO } from "@/lib/finance/dates";

/** How many days ahead counts as "due soon" for the auto-add. */
export const DUE_SOON_DAYS = 7;

/**
 * Safety net for the Payment Priority List: make sure every still-owed payable
 * that's due within DUE_SOON_DAYS (or already overdue) is on the arrangement
 * board, landing in the KIV section so it never silently slips past without
 * hijacking the hand-curated "will pay now" list.
 *
 * It only adds bills that aren't already on the board AND haven't been removed
 * by hand (arrangement_dismissed) — so taking one off the list makes it stay
 * off. Idempotent; safe to call on every Payables load and before building the
 * Lark message. Returns how many were newly added.
 */
export async function ensureDueSoonOnBoard(supabase: SupabaseClient): Promise<number> {
  const cutoff = addDays(todayISO(), DUE_SOON_DAYS);

  const { data, error } = await supabase
    .from("payables")
    .update({ arrangement: true, arrangement_kiv: true })
    .in("status", ["unpaid", "partially_paid"])
    .or("arrangement.is.null,arrangement.eq.false")
    .eq("arrangement_dismissed", false)
    .not("due_date", "is", null)
    .lte("due_date", cutoff)
    .or("needs_review.is.null,needs_review.eq.false")
    .select("id");
  if (error) return 0;
  return (data ?? []).length;
}
