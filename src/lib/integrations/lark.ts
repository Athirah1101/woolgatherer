// Lark (Feishu) custom-bot messaging.
//
// A Lark group's "Custom Bot" gives an incoming webhook URL. POSTing a small
// JSON body posts a message into that group. No OAuth needed. Set the bot's
// security to the keyword "FinanceOS" (the messages always contain it).
//
// Configure with LARK_WEBHOOK_URL in the deployment environment. No-op when
// unset, and never throws (best-effort, like the email sender).

export function larkConfigured(): boolean {
  return Boolean(process.env.LARK_WEBHOOK_URL);
}

/** Send a plain-text message to the configured Lark group. Returns true on success. */
export async function sendLark(text: string): Promise<boolean> {
  const url = process.env.LARK_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_type: "text", content: { text } }),
      cache: "no-store",
    });
    // Lark replies { code: 0, ... } on success; non-zero code = rejected.
    const body = (await res.json().catch(() => null)) as { code?: number; msg?: string } | null;
    return res.ok && (body?.code ?? 0) === 0;
  } catch {
    return false;
  }
}

type LarkTextEl = { tag: "text"; text: string; style?: string[] };

/** "*bold* and _italic_" → Lark rich-text elements with real styling. */
function toLarkLine(line: string): LarkTextEl[] {
  const out: LarkTextEl[] = [];
  const re = /\*([^*]+)\*|_([^_]+)_/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) out.push({ tag: "text", text: line.slice(last, m.index) });
    out.push(m[1] != null ? { tag: "text", text: m[1], style: ["bold"] } : { tag: "text", text: m[2], style: ["italic"] });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ tag: "text", text: line.slice(last) });
  return out.length ? out : [{ tag: "text", text: "" }];
}

/**
 * Send a rich-text ("post") message: *text* shows as real bold and _text_ as
 * italic instead of literal asterisks. For internal messages that are read in
 * Lark itself (not copied into WhatsApp). Returns true on success.
 */
export async function sendLarkRich(text: string): Promise<boolean> {
  const url = process.env.LARK_WEBHOOK_URL;
  if (!url) return false;
  try {
    const content = text.split(/\r?\n/).map(toLarkLine);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_type: "post", content: { post: { en_us: { title: "", content } } } }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as { code?: number; msg?: string } | null;
    return res.ok && (body?.code ?? 0) === 0;
  } catch {
    return false;
  }
}
