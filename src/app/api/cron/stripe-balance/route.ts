import { NextResponse, type NextRequest } from "next/server";
import { syncAllBalances } from "@/lib/integrations/balances";
import { sendNotification } from "@/lib/integrations/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundAttention, refundSummary } from "@/lib/finance/hrdc";
import { formatMYR } from "@/lib/finance/money";
import { todayISO } from "@/lib/finance/dates";
import type { HrdcClaim, HrdcRefund } from "@/lib/types";

// Runs daily via Vercel Cron (see vercel.json). Syncs every configured bank
// balance provider, then emails a daily summary + any HRDC refunds due soon.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Payex reconstructs its balance by paging its full history — give it headroom.
export const maxDuration = 60;

async function refundsDueSoon(): Promise<string[]> {
  try {
    const admin = createAdminClient();
    const today = todayISO();
    const [{ data: claims }, { data: refunds }] = await Promise.all([
      admin.from("hrdc_claims").select("*").not("hrdc_received_date", "is", null),
      admin.from("hrdc_refunds").select("*"),
    ]);
    const byClaim = new Map<string, HrdcRefund[]>();
    for (const r of (refunds ?? []) as HrdcRefund[])
      (byClaim.get(r.claim_id) ?? byClaim.set(r.claim_id, []).get(r.claim_id)!).push(r);

    const lines: string[] = [];
    for (const c of (claims ?? []) as HrdcClaim[]) {
      const rs = byClaim.get(c.id) ?? [];
      const attn = refundAttention(c, rs, today);
      if (attn && attn.days <= 7) {
        lines.push(`${c.client_name}: ${attn.text} (${formatMYR(refundSummary(c, rs).remaining)})`);
      }
    }
    return lines;
  } catch {
    return [];
  }
}

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

  // Daily email: synced balances + refunds due within 7 days (or overdue).
  const balanceLines = results
    .filter((r) => r.status === "ok")
    .map((r) => `${r.provider}: ${formatMYR(r.balance ?? 0)}`);
  const refundLines = await refundsDueSoon();
  const emailLines = [
    ...(balanceLines.length ? ["Balances synced:", ...balanceLines] : []),
    ...(refundLines.length ? ["Refunds due soon:", ...refundLines] : []),
  ];
  if (emailLines.length) await sendNotification("Daily summary", emailLines);

  return NextResponse.json({ ok: !anyError, results }, { status: anyError ? 500 : 200 });
}
