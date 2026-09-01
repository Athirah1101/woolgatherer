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
