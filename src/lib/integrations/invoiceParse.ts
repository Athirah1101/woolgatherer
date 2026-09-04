// Reads an invoice email (its text and/or a PDF attachment) and extracts the
// fields we need to create a payable: vendor, amount, due date, invoice number.
//
// Uses Claude (Haiku — a cheap, reliable extractor for this high-volume, simple
// task) via the Anthropic SDK. Requires ANTHROPIC_API_KEY in the environment.
// If the key is missing, callers can still create a payable from whatever
// structured fields they pass in; parsing is the automated convenience layer.

import Anthropic from "@anthropic-ai/sdk";

export interface ParsedInvoice {
  vendor: string | null;
  amount: number | null;
  /** ISO yyyy-mm-dd, or null when the invoice states no due date. */
  due_date: string | null;
  invoice_number: string | null;
  currency: string | null;
}

export function invoiceParseConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM = [
  "You extract billing fields from a supplier invoice for a Malaysian company.",
  "Return ONLY a JSON object with these keys:",
  '  "vendor": the supplier/biller name (string) or null,',
  '  "amount": the TOTAL amount payable as a number (no currency symbol, no thousands separators) or null,',
  '  "due_date": the payment due date as "YYYY-MM-DD" or null if none is stated,',
  '  "invoice_number": the invoice/bill number (string) or null,',
  '  "currency": the 3-letter currency code (e.g. "MYR") or null.',
  "Rules: pick the grand total (amount payable), not a line item or subtotal before tax.",
  "If a due date is written as a period like 'Net 30' or 'due within 14 days', compute it from the invoice date.",
  "Interpret ambiguous numeric dates as day/month/year (Malaysian convention).",
  "Output the JSON object and nothing else — no prose, no code fences.",
].join("\n");

type Block =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

/**
 * Extract invoice fields. `text` is the email subject+body; `pdfBase64` is an
 * optional PDF attachment (base64, no newlines). Throws on API failure.
 */
export async function parseInvoice(input: { text?: string; pdfBase64?: string }): Promise<ParsedInvoice> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY

  const content: Block[] = [];
  if (input.pdfBase64) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: input.pdfBase64.replace(/\s+/g, "") },
    });
  }
  content.push({
    type: "text",
    text: `Extract the billing fields from this invoice.\n\n${input.text ?? ""}`.trim(),
  });

  const res = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });

  const raw = res.content.find((b) => b.type === "text");
  const jsonText = raw && raw.type === "text" ? raw.text.trim() : "";
  return normalise(jsonText);
}

/** Pull the JSON object out of the model's reply and coerce the fields. */
function normalise(jsonText: string): ParsedInvoice {
  const empty: ParsedInvoice = { vendor: null, amount: null, due_date: null, invoice_number: null, currency: null };
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start === -1 || end === -1) return empty;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(jsonText.slice(start, end + 1));
  } catch {
    return empty;
  }
  const str = (v: unknown): string | null => {
    const t = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
    return t ? t : null;
  };
  const amount = typeof obj.amount === "number" ? obj.amount : Number(String(obj.amount ?? "").replace(/[^0-9.]/g, ""));
  const due = str(obj.due_date);
  return {
    vendor: str(obj.vendor),
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    due_date: due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
    invoice_number: str(obj.invoice_number),
    currency: str(obj.currency),
  };
}
