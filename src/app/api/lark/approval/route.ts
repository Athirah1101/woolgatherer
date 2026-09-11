import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { larkTenantToken, larkGetInstance } from "@/lib/integrations/larkApproval";
import { todayISO } from "@/lib/finance/dates";

// Callback for the Lark approval apps (Payment Voucher, Petty Cash Request,
// Refund Authorisation). Lark POSTs here when an approval instance changes
// status; on APPROVED we read the request's fields and create a payable
// straight in the active list. Also answers Lark's URL verification handshake.
//
// Env: LARK_APP_ID, LARK_APP_SECRET, LARK_APPROVAL_ENCRYPT_KEY (optional),
//      LARK_OPEN_BASE (optional).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Decrypt Lark's AES-256-CBC event envelope ({ "encrypt": "..." }). */
function decryptEvent(encrypt: string, key: string): unknown {
  const aesKey = crypto.createHash("sha256").update(key).digest();
  const data = Buffer.from(encrypt, "base64");
  const iv = data.subarray(0, 16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
  decipher.setAutoPadding(false);
  let out = Buffer.concat([decipher.update(data.subarray(16)), decipher.final()]);
  out = out.subarray(0, out.length - out[out.length - 1]); // strip PKCS7 padding
  return JSON.parse(out.toString("utf8"));
}

/** Best-effort: pull payee / amount / purpose out of the form widgets. */
function mapRequest(form: unknown): { payee: string | null; amount: number | null; purpose: string | null } {
  const widgets = Array.isArray(form) ? form : [];
  let payee: string | null = null;
  let amount: number | null = null;
  let purpose: string | null = null;
  for (const w of widgets as { name?: string; type?: string; value?: unknown }[]) {
    const label = (w.name ?? "").toLowerCase();
    const valStr = typeof w.value === "string" ? w.value : w.value == null ? "" : String(w.value);
    if (amount == null && (w.type === "amount" || w.type === "number" || /amount|rm|sum|total/.test(label))) {
      const n = Number(String(w.value).replace(/[^0-9.]/g, ""));
      if (Number.isFinite(n) && n > 0) amount = n;
    }
    if (!payee && /pay(ee| to)|vendor|supplier|beneficiar|recipient|claimant|applicant|\bname\b|project lead/.test(label) && valStr) {
      payee = valStr;
    }
    if (!purpose && /purpose|reason|descriptio|detail|remark|particular|note|program|course/.test(label) && valStr) {
      purpose = valStr;
    }
  }
  return { payee, amount, purpose };
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({}, { status: 400 });
  }

  // Encrypted envelope → decrypt first.
  const encKey = process.env.LARK_APPROVAL_ENCRYPT_KEY;
  if (typeof body.encrypt === "string") {
    if (!encKey) return NextResponse.json({ error: "encrypt key not set" }, { status: 400 });
    body = decryptEvent(body.encrypt, encKey) as Record<string, unknown>;
  }

  // URL verification handshake (run once when you register the request URL).
  if (body.type === "url_verification" || typeof body.challenge === "string") {
    return NextResponse.json({ challenge: body.challenge });
  }

  // Event. v2 payload: { schema:"2.0", header:{event_type}, event:{...} }.
  const event = (body.event as Record<string, unknown>) ?? body;
  const status = String(event.status ?? "");
  const instanceCode = String(event.instance_code ?? "");

  // Only act on an APPROVED instance. (The app is only subscribed to the three
  // finance approvals, so everything arriving here is one of them.)
  if (status !== "APPROVED" || !instanceCode) {
    return NextResponse.json({ code: 0 }); // ack everything else
  }

  const supabase = createAdminClient();
  const { data: dupe } = await supabase
    .from("payables").select("id").eq("invoice_ref", instanceCode).limit(1).maybeSingle();
  if (dupe) return NextResponse.json({ code: 0, skipped: "duplicate" });

  const token = await larkTenantToken();
  if (!token) return NextResponse.json({ code: 0, skipped: "no app credentials yet" });
  const inst = await larkGetInstance(instanceCode, token);
  if (!inst) return NextResponse.json({ code: 0, skipped: "could not fetch instance" });

  let form: unknown = [];
  try {
    form = JSON.parse(inst.form ?? "[]");
  } catch {
    /* keep [] */
  }
  const { payee, amount, purpose } = mapRequest(form);
  const kind = inst.approval_name || "Lark approval";

  await supabase.from("payables").insert({
    payee: payee || kind,
    description: [kind, purpose].filter(Boolean).join(" — "),
    amount: amount ?? 0,
    due_date: todayISO(),
    status: "unpaid",
    needs_review: false,
    source: "lark_voucher",
    invoice_ref: instanceCode,
    reference: inst.serial_number ?? null,
    // Keep the raw form so nothing is lost if the auto-mapping misses a field.
    notes: `Imported from Lark: ${kind}.\n${inst.form ?? ""}`.slice(0, 4000),
  });

  return NextResponse.json({ code: 0 });
}
