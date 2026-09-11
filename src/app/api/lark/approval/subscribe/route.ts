import { NextResponse, type NextRequest } from "next/server";
import { larkTenantToken, larkSubscribeApproval } from "@/lib/integrations/larkApproval";

// One-time helper: subscribe the custom app to the finance approval definitions
// so their instance events start pushing to /api/lark/approval. Runs on Vercel
// (which can reach Lark). Call:
//   /api/lark/approval/subscribe?secret=<CRON_SECRET>&codes=<code1,code2,code3>
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.nextUrl.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const codes = (request.nextUrl.searchParams.get("codes") || "")
    .split(",").map((c) => c.trim()).filter(Boolean);
  if (codes.length === 0) {
    return NextResponse.json({ error: "pass ?codes=code1,code2,..." }, { status: 400 });
  }

  const token = await larkTenantToken();
  if (!token) {
    return NextResponse.json({ error: "LARK_APP_ID / LARK_APP_SECRET not set" }, { status: 503 });
  }

  const results: Record<string, unknown> = {};
  for (const code of codes) {
    results[code] = await larkSubscribeApproval(code, token);
  }
  return NextResponse.json({ ok: true, results });
}
