// Server-side helpers for talking to the Lark Approval API. Only runs on Vercel
// (which can reach Lark); the app's credentials come from env vars.

export const LARK_OPEN_BASE = process.env.LARK_OPEN_BASE || "https://open.larksuite.com";

export interface LarkInstance {
  approval_code?: string;
  approval_name?: string;
  instance_code?: string;
  status?: string;
  serial_number?: string;
  form?: string; // JSON string of the form widgets
}

/** Get a tenant access token for the custom app. Null if creds not set. */
export async function larkTenantToken(): Promise<string | null> {
  const app_id = process.env.LARK_APP_ID;
  const app_secret = process.env.LARK_APP_SECRET;
  if (!app_id || !app_secret) return null;
  const res = await fetch(`${LARK_OPEN_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id, app_secret }),
  });
  const json = (await res.json()) as { tenant_access_token?: string };
  return json.tenant_access_token ?? null;
}

/** Fetch one approval instance (form fields, serial number, approval name). */
export async function larkGetInstance(instanceCode: string, token: string): Promise<LarkInstance | null> {
  const res = await fetch(`${LARK_OPEN_BASE}/open-apis/approval/v4/instances/${instanceCode}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as { code?: number; data?: LarkInstance };
  return json.data ?? null;
}

/** Subscribe the app to an approval definition so its instance events push. */
export async function larkSubscribeApproval(approvalCode: string, token: string): Promise<{ code?: number; msg?: string }> {
  const res = await fetch(
    `${LARK_OPEN_BASE}/open-apis/approval/v4/approvals/${approvalCode}/subscribe`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
  return (await res.json()) as { code?: number; msg?: string };
}
