"use client";

import { useActionState, useEffect, useState } from "react";
import { buttonClass } from "@/components/ui";
import { postBalanceToLarkNow } from "../actions";

/** Sends the current cash balance to the Lark group on demand (test / manual send). */
export function PostToLarkButton() {
  const [state, action, pending] = useActionState(postBalanceToLarkNow, null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (state?.ok) setMsg("✓ Sent to Lark");
    else if (state?.error) setMsg(`⚠ ${state.error}`);
  }, [state]);

  return (
    <form action={action} className="flex items-center gap-2">
      <button type="submit" disabled={pending} className={buttonClass("secondary")}>
        {pending ? "Sending…" : "Post to Lark now"}
      </button>
      {msg && (
        <span className={state?.ok ? "text-sm text-emerald-600" : "text-sm text-red-600"}>{msg}</span>
      )}
    </form>
  );
}
