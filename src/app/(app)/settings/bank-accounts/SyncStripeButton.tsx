"use client";

import { useActionState, useEffect, useState } from "react";
import { buttonClass } from "@/components/ui";
import { syncBalancesNow } from "../actions";

/** One-click pull of the latest balances from every configured provider. */
export function SyncBalancesButton() {
  const [state, action, pending] = useActionState(syncBalancesNow, null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (state?.ok) setMsg(`✓ ${state.detail ?? "Balances updated"}`);
    else if (state?.error) setMsg(`⚠ ${state.error}`);
  }, [state]);

  return (
    <form action={action} className="flex items-center gap-2">
      <button type="submit" disabled={pending} className={buttonClass("secondary")}>
        {pending ? "Syncing…" : "Sync balances now"}
      </button>
      {msg && (
        <span className={state?.ok ? "text-sm text-emerald-600" : "text-sm text-red-600"}>
          {msg}
        </span>
      )}
    </form>
  );
}
