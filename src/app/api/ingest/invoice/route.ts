import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseInvoice, invoiceParseConfigured, type ParsedInvoice } from "@/lib/integrations/invoiceParse";
import { sendLark, larkConfigured } from "@/lib/integrations/lark";
import { formatMYR } from "@/lib/finance/money";
import { formatDate, todayISO } from "@/lib/finance/dates";

// Receives an invoice email (from the finance@ connector) and creates a payable
// flagged "Needs review". Reads amount/due date/vendor off the PDF or email body
// with Claude when those aren't supplied. Protected by INVOICE_INGEST_SECRET.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

interface IngestBody {
  subject?: string;
  from?: string;
  text?: string;
  pdf_base64?: string;
  // Optional pre-parsed fields — used as-is when present (skips Claude).
  vendor?: string;
  amount?: number | string;
  due_date?: string;
  invoice_number?: string;
}

export async function POST(request: NextRequest) {
  const secret = process.env.INVOICE_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "INVOICE_INGEST_SECRET not set" }, { status: 503 });
  }
  if (request.headers.get("x-ingest-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: IngestBody;
  try {
    body = (await request.json()) as IngestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const emailText = [body.subject, body.text].filter(Boolean).join("\n\n");

  // Use supplied fields if given; otherwise ask Claude to read the invoice.
  let parsed: ParsedInvoice = {
    vendor: body.vendor?.trim() || null,
    amount: body.amount != null && body.amount !== "" ? Number(body.amount) : null,
    due_date: body.due_date?.trim() || null,
    invoice_number: body.invoice_number?.trim() || null,
    currency: null,
  };
  const haveAll = parsed.vendor && parsed.amount != null && parsed.due_date;
  if (!haveAll && invoiceParseConfigured() && (emailText || body.pdf_base64)) {
    try {
      const ai = await parseInvoice({ text: emailText, pdfBase64: body.pdf_base64 });
      // Prefer explicitly-supplied fields; fill the gaps from Claude.
      parsed = {
        vendor: parsed.vendor ?? ai.vendor,
        amount: parsed.amount ?? ai.amount,
        due_date: parsed.due_date ?? ai.due_date,
        invoice_number: parsed.invoice_number ?? ai.invoice_number,
        currency: ai.currency,
      };
    } catch (e) {
      // Parsing failed — still create a review stub so nothing is silently lost.
      console.error("invoice parse failed:", (e as Error).message);
    }
  }

  const supabase = createAdminClient();
  const payee = parsed.vendor || body.from?.trim() || "Unknown vendor";
  const invoiceRef = parsed.invoice_number || body.subject?.trim() || null;

  // De-dupe: skip if a payable already exists for this invoice reference.
  if (invoiceRef) {
    const { data: dupe } = await supabase
      .from("payables").select("id").eq("invoice_ref", invoiceRef).limit(1).maybeSingle();
    if (dupe) {
      return NextResponse.json({ ok: true, skipped: "duplicate invoice_ref", id: dupe.id });
    }
  }

  const { data, error } = await supabase
    .from("payables")
    .insert({
      payee,
      amount: parsed.amount ?? 0,
      due_date: parsed.due_date || todayISO(),
      description: body.subject?.trim() || null,
      notes: body.from ? `From: ${body.from}` : null,
      status: "unpaid",
      needs_review: true,
      source: "email",
      invoice_ref: invoiceRef,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort Lark ping — never blocks the import.
  if (larkConfigured()) {
    try {
      await sendLark(
        [
          "🧾 New payable added (needs review)",
          `${payee} — ${formatMYR(parsed.amount ?? 0)}`,
          `Due ${formatDate(parsed.due_date || todayISO())}`,
        ].join("\n"),
      );
    } catch {
      /* ignore notification failure */
    }
  }

  return NextResponse.json({ ok: true, id: data?.id, parsed });
}
