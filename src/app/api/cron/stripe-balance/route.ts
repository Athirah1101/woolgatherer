import { NextResponse, type NextRequest } from "next/server";
import { syncAllBalances } from "@/lib/integrations/balances";

// Runs daily via Vercel Cron (see vercel.json). Syncs every configured bank
// balance provider (Stripe, Airwallex, …). Vercel sends
// `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set, which we
// verify so the endpoint can't be triggered by anyone else.
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

  const results = await syncAllBalances();
  const anyError = results.some((r) => r.status === "error");
  return NextResponse.json({ ok: !anyError, results }, { status: anyError ? 500 : 200 });
}
