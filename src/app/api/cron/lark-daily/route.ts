import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLark, larkConfigured } from "@/lib/integrations/lark";
import { formatMYR } from "@/lib/finance/money";
import { formatDate, formatTime } from "@/lib/finance/dates";

// Posts the daily cash balance into the Lark group at noon MYT (see vercel.json:
// "0 4 * * *" = 04:00 UTC). Protected by CRON_SECRET.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface BankRow {
  account_name: string;
  current_balance: number | string;
  active: boolean;
  sort_order: number | null;
  updated_at: string | null;
}

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

  const admin = createAdminClient();
  const { data } = await admin
    .from("bank_accounts")
    .select("account_name, current_balance, active, sort_order, updated_at")
    .order("sort_order", { ascending: true });

  const accounts = ((data ?? []) as BankRow[]).filter((a) => a.active);
  if (accounts.length === 0) {
    return NextResponse.json({ ok: false, skipped: "no active accounts" });
  }

  const total = accounts.reduce((sum, a) => sum + Number(a.current_balance || 0), 0);
  // Freshness = the most recent balance update across accounts.
  const latest = accounts
    .map((a) => a.updated_at)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);

  const lines = [
    "💰 FinanceOS — Daily Cash Balance",
    formatDate(new Date().toISOString().slice(0, 10)),
    "",
    ...accounts.map((a) => `${a.account_name}: ${formatMYR(a.current_balance)}`),
    "──────────────",
    `Total Cash: ${formatMYR(total)}`,
    ...(latest ? [`(as of ${formatTime(latest)})`] : []),
  ];

  const sent = await sendLark(lines.join("\n"));
  return NextResponse.json({ ok: sent, total }, { status: sent ? 200 : 502 });
}
