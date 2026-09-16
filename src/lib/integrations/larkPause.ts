import { createAdminClient } from "@/lib/supabase/admin";
import { todayISO } from "@/lib/finance/dates";

// One-day pause for the automatic Lark posts. When app_settings
// "lark_autopost_skip_date" equals today's date (business tz), the noon crons
// skip sending. The manual "Post to Lark now" buttons ignore this — they call
// the builders directly — so you can still post on demand.
export async function autopostPausedToday(): Promise<boolean> {
  try {
    const { data } = await createAdminClient()
      .from("app_settings").select("value").eq("key", "lark_autopost_skip_date").maybeSingle();
    return typeof data?.value === "string" && data.value === todayISO();
  } catch {
    return false; // never let this check block a legitimate send
  }
}
