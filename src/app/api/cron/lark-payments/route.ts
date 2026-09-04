import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLark, larkConfigured } from "@/lib/integrations/lark";
import { buildPaymentArrangementMessage } from "@/lib/integrations/larkPayments";

// Posts the payment-arrangement list into the Lark group every Wed & Fri at noon
// MYT (triggered by the GitHub Actions workflow). Protected by CRON_SECRET.
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

  const text = await buildPaymentArrangementMessage(createAdminClient());
  if (!text) return NextResponse.json({ ok: false, skipped: "no items on the arrangement board" });

  const sent = await sendLark(text);
  return NextResponse.json({ ok: sent }, { status: sent ? 200 : 502 });
}
