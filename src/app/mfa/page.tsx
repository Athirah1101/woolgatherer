"use client";

// Step 2 of signing in: the 6-digit code from an authenticator app (Google
// Authenticator, Microsoft Authenticator, 1Password…). Accounts that haven't
// set one up yet are walked through scanning the QR code first — so nobody can
// get in with just the email + password.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field, Input } from "@/components/form";
import { buttonClass } from "@/components/ui";

type Mode = "loading" | "verify" | "setup";

export default function MfaPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return router.replace("/login");
      setEmail(u.user.email ?? "");
      const { data } = await supabase.auth.mfa.listFactors();
      const ready = data?.totp?.find((f) => f.status === "verified");
      if (ready) {
        setFactorId(ready.id);
        setMode("verify");
        return;
      }
      // First time: clear any half-finished setup, then start a fresh one.
      for (const f of data?.all ?? []) {
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: en, error: enErr } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
      });
      if (enErr || !en) {
        setError(enErr?.message ?? "Couldn't start the setup. Refresh to try again.");
        setMode("setup");
        return;
      }
      setFactorId(en.id);
      setQr(en.totp.qr_code);
      setSecret(en.totp.secret);
      setMode("setup");
    })();
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({
      factorId,
      code: code.replace(/\s/g, ""),
    });
    if (error) {
      setError("That code didn't work. Check it's the current 6-digit code and try again.");
      setBusy(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl logo-gradient text-lg font-bold text-white">
            F
          </div>
          <h1 className="text-xl font-semibold">
            {mode === "setup" ? "Set up 2-step verification" : "Enter your code"}
          </h1>
          <p className="text-sm text-muted">{email}</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm"
        >
          {mode === "loading" && <p className="text-sm text-muted">Loading…</p>}

          {mode === "setup" && (
            <div className="space-y-3 text-sm">
              <p>
                1. Open an authenticator app on your phone (Google Authenticator, Microsoft
                Authenticator or similar) and scan this code:
              </p>
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR code for your authenticator app" className="mx-auto h-48 w-48 rounded-lg bg-white p-2" />
              )}
              {secret && (
                <p className="text-xs text-muted">
                  Can&apos;t scan? Enter this key manually:{" "}
                  <span className="break-all font-mono text-text">{secret}</span>
                </p>
              )}
              <p>2. Type the 6-digit code the app shows:</p>
            </div>
          )}

          {mode === "verify" && (
            <p className="text-sm text-muted">
              Open your authenticator app and enter the 6-digit code for FinanceOS.
            </p>
          )}

          {mode !== "loading" && (
            <>
              <Field label="6-digit code" required>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]{6,7}"
                  maxLength={7}
                  autoFocus
                  required
                />
              </Field>
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              )}
              <button type="submit" disabled={busy || !factorId} className={buttonClass("primary") + " w-full"}>
                {busy ? "Checking…" : mode === "setup" ? "Turn on & continue" : "Verify"}
              </button>
            </>
          )}
        </form>

        <button
          type="button"
          onClick={signOut}
          className="mt-4 w-full text-center text-sm text-muted hover:text-text"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
