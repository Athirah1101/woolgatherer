"use client";

// Manage the authenticator apps linked to this login. Shared logins (e.g.
// finance@) can link several phones so each person has their own codes.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Field, Input } from "@/components/form";
import { Card, buttonClass } from "@/components/ui";
import { formatDate } from "@/lib/finance/dates";

interface Device {
  id: string;
  friendly_name?: string;
  created_at: string;
}

export function SecurityDevices({ email }: { email: string }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [adding, setAdding] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await createClient().auth.mfa.listFactors();
    setDevices((data?.totp ?? []).filter((f) => f.status === "verified") as Device[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function startAdd() {
    setMsg(null);
    const supabase = createClient();
    // Clear any half-finished setup first.
    const { data } = await supabase.auth.mfa.listFactors();
    for (const f of data?.all ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data: en, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: name.trim() || `Phone ${devices.length + 1}`,
    });
    if (error || !en) return setMsg({ ok: false, text: error?.message ?? "Couldn't start setup." });
    setAdding({ id: en.id, qr: en.totp.qr_code, secret: en.totp.secret });
  }

  async function confirmAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!adding) return;
    setBusy(true);
    const { error } = await createClient().auth.mfa.challengeAndVerify({
      factorId: adding.id,
      code: code.replace(/\s/g, ""),
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: "That code didn't work — try the current one." });
    setAdding(null);
    setCode("");
    setName("");
    setMsg({ ok: true, text: "✓ Device added" });
    load();
  }

  async function remove(d: Device) {
    if (devices.length <= 1) {
      return setMsg({ ok: false, text: "This is the only device — add another one before removing it." });
    }
    if (!confirm(`Remove "${d.friendly_name ?? "this device"}"? It will no longer be able to sign in.`)) return;
    const { error } = await createClient().auth.mfa.unenroll({ factorId: d.id });
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: "✓ Device removed" });
    load();
  }

  return (
    <div className="max-w-xl space-y-4">
      <Card>
        <h2 className="mb-1 text-sm font-semibold">Linked authenticator apps · {email}</h2>
        <p className="mb-3 text-xs text-muted">
          Anyone who shares this login needs one of these to sign in. Add each person&apos;s phone
          separately so you can remove one without affecting the others.
        </p>
        {devices.length === 0 ? (
          <p className="text-sm text-muted">None yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  📱 {d.friendly_name ?? "Authenticator"}{" "}
                  <span className="text-xs text-muted">· added {formatDate(d.created_at.slice(0, 10))}</span>
                </span>
                <button type="button" onClick={() => remove(d)} className="text-xs text-muted hover:text-red-600">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Add another phone</h2>
        {!adding ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Name (e.g. Athirah's iPhone)">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <button type="button" onClick={startAdd} className={buttonClass("secondary")}>
              Show QR code
            </button>
          </div>
        ) : (
          <form onSubmit={confirmAdd} className="space-y-3 text-sm">
            <p>Scan this with the new phone&apos;s authenticator app:</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={adding.qr} alt="QR code" className="h-44 w-44 rounded-lg bg-white p-2" />
            <p className="text-xs text-muted">
              Or enter this key: <span className="break-all font-mono text-text">{adding.secret}</span>
            </p>
            <Field label="Code shown on the new phone" required>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                required
              />
            </Field>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className={buttonClass("primary")}>
                {busy ? "Checking…" : "Add device"}
              </button>
              <button type="button" onClick={() => setAdding(null)} className={buttonClass("secondary")}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
