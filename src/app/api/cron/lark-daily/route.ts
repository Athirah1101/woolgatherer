import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLark, larkConfigured } from "@/lib/integrations/lark";
import { buildDailyBalanceMessage } from "@/lib/integrations/larkDaily";

// Posts the daily cash balance into the Lark group at noon MYT (see vercel.json:
// "0 4 * * *" = 04:00 UTC). Protected by CRON_SECRET.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!larkConfigured()) {
    return NextResponse.json({ ok: false, skipped: "LARK_WEBHOOK_URL not set" });
  }

  const text = await buildDailyBalanceMessage(createAdminClient());
  if (!text) return NextResponse.json({ ok: false, skipped: "no accounts" });

  const sent = await sendLark(text);
  return NextResponse.json({ ok: sent }, { status: sent ? 200 : 502 });
}
