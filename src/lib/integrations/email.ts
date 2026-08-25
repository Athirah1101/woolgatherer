// Email notifications via Resend. Fire-and-forget: never throws, so a mail
// failure can't break the action that triggered it. No-op until RESEND_API_KEY
// is set.
//
// FROM defaults to Resend's shared onboarding sender, which in test mode only
// delivers to the Resend account owner's own address. To deliver to every
// recipient, verify a domain in Resend and set RESEND_FROM (e.g.
// "FinanceOS <finance@vertexmastery.com>").

const DEFAULT_RECIPIENTS = "athirah@vertexmastery.com,shevone@vertexmastery.com";

function recipients(): string[] {
  return (process.env.NOTIFY_EMAILS ?? DEFAULT_RECIPIENTS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function sendNotification(
  subject: string,
  lines: string[],
  toOverride?: string[],
): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return; // notifications not configured yet
  const from = process.env.RESEND_FROM || "FinanceOS <onboarding@resend.dev>";
  const to = toOverride && toOverride.length ? toOverride : recipients();
  if (to.length === 0) return;

  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:14px;color:#111">
      <h2 style="margin:0 0 8px;font-size:16px">${escapeHtml(subject)}</h2>
      <ul style="margin:0;padding-left:18px">
        ${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}
      </ul>
      <p style="margin-top:16px;color:#888;font-size:12px">Sent automatically by FinanceOS.</p>
    </div>`;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: `FinanceOS — ${subject}`, html }),
    });
  } catch {
    /* email is best-effort */
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
