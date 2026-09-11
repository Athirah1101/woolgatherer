import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayISO } from "@/lib/finance/dates";

// Callback for the Lark "Payment Voucher" approval app. Lark POSTs here when an
// approval instance changes status; on APPROVED we read the voucher's fields and
// create a payable straight in the active list. Also answers Lark's URL
// verification handshake so the request URL can be registered.
//
// Env:
//   LARK_APP_ID, LARK_APP_SECRET       — the custom app's credentials
//   LARK_APPROVAL_ENCRYPT_KEY          — optional; set only if you enable encryption
//   LARK_VOUCHER_APPROVAL_CODE         — optional; restrict to this approval definition
//   LARK_OPEN_BASE                     — optional; defaults to open.larksuite.com
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BASE = process.env.LARK_OPEN_BASE || "https://open.larksuite.com";

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

async function tenantToken(): Promise<string | null> {
  const app_id = process.env.LARK_APP_ID;
  const app_secret = process.env.LARK_APP_SECRET;
  if (!app_id || !app_secret) return null;
  const res = await fetch(`${BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id, app_secret }),
  });
  const json = (await res.json()) as { tenant_access_token?: string };
  return json.tenant_access_token ?? null;
}

/** Pull payee / amount / purpose out of an approval instance's form widgets. */
function mapVoucher(form: unknown): { payee: string | null; amount: number | null; purpose: string | null } {
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
    if (!payee && /pay(ee| to)|vendor|beneficiar|recipient|supplier|to whom/.test(label) && valStr) payee = valStr;
    if (!purpose && /purpose|reason|descriptio|detail|remark|particular|note/.test(label) && valStr) purpose = valStr;
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
  const approvalCode = String(event.approval_code ?? "");
  const voucherCode = process.env.LARK_VOUCHER_APPROVAL_CODE;

  // Only act on an APPROVED instance of the voucher approval.
  const isVoucher = !voucherCode || approvalCode === voucherCode;
  if (status !== "APPROVED" || !instanceCode || !isVoucher) {
    return NextResponse.json({ code: 0 }); // ack everything else
  }

  const supabase = createAdminClient();
  // De-dupe on the instance code so re-delivered events don't double-add.
  const { data: dupe } = await supabase
    .from("payables").select("id").eq("invoice_ref", instanceCode).limit(1).maybeSingle();
  if (dupe) return NextResponse.json({ code: 0, skipped: "duplicate" });

  // Fetch the instance to read the form fields.
  const token = await tenantToken();
  if (!token) return NextResponse.json({ code: 0, skipped: "no app credentials yet" });
  const res = await fetch(`${BASE}/open-apis/approval/v4/instances/${instanceCode}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const inst = (await res.json()) as { data?: { form?: string; serial_number?: string } };
  let form: unknown = [];
  try {
    form = JSON.parse(inst.data?.form ?? "[]");
  } catch {
    /* keep [] */
  }
  const { payee, amount, purpose } = mapVoucher(form);

  await supabase.from("payables").insert({
    payee: payee || "Payment voucher",
    description: purpose || "Payment voucher (Lark-approved)",
    amount: amount ?? 0,
    due_date: todayISO(),
    status: "unpaid",
    needs_review: false,
    source: "lark_voucher",
    invoice_ref: instanceCode,
    reference: inst.data?.serial_number ?? null,
    // Keep the raw form so nothing is lost if the auto-mapping misses a field.
    notes: `Imported from Lark approval.\n${inst.data?.form ?? ""}`.slice(0, 4000),
  });

  return NextResponse.json({ code: 0 });
}
