"use client";

import { useActionState, useEffect, useState } from "react";
import { buttonClass } from "@/components/ui";
import { postPaymentsMadeToLarkNow } from "./actions";

/**
 * Posts "Recently Paid Payables" to Lark on demand: every payment marked paid
 * since the last post, grouped by the day it went out. Works any day.
 */
export function PostPaymentsMadeButton({ pendingCount }: { pendingCount: number }) {
  const [state, action, pending] = useActionState(postPaymentsMadeToLarkNow, null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (state?.ok) setMsg("✓ Sent to Lark");
    else if (state?.error) setMsg(`⚠ ${state.error}`);
  }, [state]);
  return (
    <form action={action} className="flex items-center gap-2">
      <button
        type="submit"
        disabled={pending}
        className={buttonClass("secondary")}
        title="Posts every payment marked paid since the last post, grouped by the date it went out"
      >
        {pending ? "Sending…" : `Post recently paid (${pendingCount} new)`}
      </button>
      {msg && <span className={state?.ok ? "text-sm text-emerald-600" : "text-sm text-red-600"}>{msg}</span>}
    </form>
  );
}
