"use client";

import { useActionState, useEffect, useState } from "react";
import { buttonClass } from "@/components/ui";
import { postPaymentsMadeToLarkNow } from "./actions";

/** Posts the latest pay run's (last Wed/Fri) "Payments Made" recap to Lark on demand. */
export function PostPaymentsMadeButton({ runLabel }: { runLabel: string }) {
  const [state, action, pending] = useActionState(postPaymentsMadeToLarkNow, null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (state?.ok) setMsg("✓ Sent to Lark");
    else if (state?.error) setMsg(`⚠ ${state.error}`);
  }, [state]);
  return (
    <form action={action} className="flex items-center gap-2">
      <button type="submit" disabled={pending} className={buttonClass("secondary")}>
        {pending ? "Sending…" : `Post payments made (${runLabel})`}
      </button>
      {msg && <span className={state?.ok ? "text-sm text-emerald-600" : "text-sm text-red-600"}>{msg}</span>}
    </form>
  );
}
