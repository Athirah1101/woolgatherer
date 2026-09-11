import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLark, larkConfigured } from "@/lib/integrations/lark";
import { buildPaymentsMadeMessage } from "@/lib/integrations/larkPayments";
import { todayISO } from "@/lib/finance/dates";

// Posts a recap of everything paid TODAY (business timezone) into the Lark
// group. Meant to run once a day at 23:59 MYT (cron-job.org hits this). An
// optional ?date=YYYY-MM-DD overrides the day. Protected by CRON_SECRET.
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

  const date = request.nextUrl.searchParams.get("date") || todayISO();
  const text = await buildPaymentsMadeMessage(createAdminClient(), date);
  if (!text) return NextResponse.json({ ok: false, skipped: "nothing paid on this day" });

  const sent = await sendLark(text);
  return NextResponse.json({ ok: sent }, { status: sent ? 200 : 502 });
}
