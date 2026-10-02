import { createAdminClient } from "@/lib/supabase/admin";
import { todayISO } from "@/lib/finance/dates";

// One-day pause for the automatic Lark posts. The noon crons skip sending when
// today's date (business tz) is stored in:
//   - "lark_autopost_skip_date"  → pauses BOTH posts
//   - "lark_daily_skip_date"     → pauses only the daily bank balance
//   - "lark_payments_skip_date"  → pauses only the Wed/Fri payment list
// The manual "Post to Lark now" buttons ignore this — they call the builders
// directly — so you can still post on demand.
export type LarkPost = "daily" | "payments";

export async function autopostPausedToday(post?: LarkPost): Promise<boolean> {
  try {
    const keys = ["lark_autopost_skip_date", ...(post ? [`lark_${post}_skip_date`] : [])];
    const { data } = await createAdminClient()
      .from("app_settings").select("value").in("key", keys);
    const today = todayISO();
    return (data ?? []).some((r) => typeof r.value === "string" && r.value === today);
  } catch {
    return false; // never let this check block a legitimate send
  }
}
