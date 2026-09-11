import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayISO } from "@/lib/finance/dates";

// Receives an APPROVED payment voucher from the Lark Approval app and creates a
// payable straight in the active list (no review step — it's already approved).
// Protected by VOUCHER_INGEST_SECRET. Accepts clean JSON fields, so it works
// with a Lark automation "HTTP request" action or a Zapier webhook.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface VoucherBody {
  payee?: string; // who is being paid
  amount?: number | string; // approved amount (RM)
  description?: string; // purpose of the voucher
  due_date?: string; // pay-by date (YYYY-MM-DD); defaults to today
  voucher_no?: string; // approval/voucher number — used to de-dupe
  reference?: string; // any extra reference
  notes?: string;
}

export async function POST(request: NextRequest) {
  const secret = process.env.VOUCHER_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "VOUCHER_INGEST_SECRET not set" }, { status: 503 });
  }
  if (request.headers.get("x-ingest-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: VoucherBody;
  try {
    body = (await request.json()) as VoucherBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payee = body.payee?.trim();
  const amount = body.amount != null && body.amount !== "" ? Number(body.amount) : NaN;
  if (!payee || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "payee and a positive amount are required" }, { status: 400 });
  }

  const voucherNo = body.voucher_no?.trim() || null;
  const supabase = createAdminClient();

  // De-dupe on the voucher number so a re-sent approval doesn't double-add.
  if (voucherNo) {
    const { data: dupe } = await supabase
      .from("payables").select("id").eq("invoice_ref", voucherNo).limit(1).maybeSingle();
    if (dupe) {
      return NextResponse.json({ ok: true, skipped: "duplicate voucher_no", id: dupe.id });
    }
  }

  const { data: created, error } = await supabase
    .from("payables")
    .insert({
      payee,
      description: body.description?.trim() || "Payment voucher (Lark-approved)",
      amount,
      due_date: body.due_date?.trim() || todayISO(),
      status: "unpaid",
      needs_review: false, // already approved in Lark → straight into the list
      source: "lark_voucher",
      invoice_ref: voucherNo,
      reference: body.reference?.trim() || null,
      notes: body.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? "Could not create payable" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: created.id });
}
