"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Card, Chip, buttonClass } from "@/components/ui";
import { formatMYR } from "@/lib/finance/money";
import { formatDate } from "@/lib/finance/dates";
import { owedAmount } from "@/lib/finance/payables";
import type { Payable } from "@/lib/types";
import {
  postPaymentsToLarkNow,
  removeFromArrangement,
  reorderArrangement,
  setArrangementHold,
  setArrangementNote,
} from "./actions";

/** Sends the arrangement list to Lark on demand (same message the cron sends). */
function PostNowButton() {
  const [state, action, pending] = useActionState(postPaymentsToLarkNow, null);
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
      {msg && <span className={state?.ok ? "text-sm text-emerald-600" : "text-sm text-red-600"}>{msg}</span>}
    </form>
  );
}

export function ArrangementBoard({ items: initial }: { items: Payable[] }) {
  const [items, setItems] = useState(initial);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  // Adopt server updates (add/remove/paid) unless a reorder is mid-save.
  useEffect(() => {
    if (!pending) setItems(initial);
  }, [initial, pending]);

  function onDrop(target: number) {
    if (dragIndex === null || dragIndex === target) return setDragIndex(null);
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(target, 0, moved);
    setItems(next);
    setDragIndex(null);
    startTransition(() => reorderArrangement(next.map((a) => a.id)));
  }

  function toggleHold(p: Payable) {
    setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, arrangement_hold: !p.arrangement_hold } : x)));
    startTransition(() => setArrangementHold(p.id, !p.arrangement_hold));
  }

  const payTotal = items
    .filter((p) => !p.arrangement_hold)
    .reduce((sum, p) => sum + owedAmount(p), 0);

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Payment Arrangement</h2>
          <p className="text-xs text-muted">
            Auto-posts to Lark every Wed &amp; Fri at noon. Drag to reorder · unpaid items carry over.
          </p>
        </div>
        <PostNowButton />
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">
          Nothing here yet. Use <span className="font-medium">“+ Add to list”</span> on any payable below to
          build the Wed/Fri list.
        </p>
      ) : (
        <>
          <ul>
            {items.map((p, i) => (
              <li
                key={p.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(i)}
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2.5 last:border-0 ${
                  dragIndex === i ? "opacity-40" : ""
                } ${p.arrangement_hold ? "bg-amber-50/40" : ""}`}
              >
                <span
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragEnd={() => setDragIndex(null)}
                  className="cursor-grab select-none text-muted"
                  title="Drag to reorder"
                >
                  ⋮⋮
                </span>
                <span className="w-5 text-right text-sm tabular-nums text-muted">{i + 1}.</span>
                <div className="min-w-[8rem] flex-1">
                  <div className="text-sm font-medium">{p.payee}</div>
                  <div className="text-xs text-muted">Due {formatDate(p.due_date)}</div>
                </div>
                <input
                  defaultValue={p.arrangement_note ?? ""}
                  placeholder="note (e.g. reason)…"
                  onBlur={(e) => {
                    if ((e.target.value.trim() || "") !== (p.arrangement_note ?? ""))
                      startTransition(() => setArrangementNote(p.id, e.target.value));
                  }}
                  className="min-w-[9rem] flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm"
                />
                <span className="w-24 text-right text-sm font-medium tabular-nums">{formatMYR(owedAmount(p))}</span>
                <button
                  type="button"
                  onClick={() => toggleHold(p)}
                  className="rounded-md px-1.5 py-0.5 text-xs"
                  title={p.arrangement_hold ? "Currently on hold — click to move back to pay list" : "Put on hold (exclude from message)"}
                >
                  <Chip tone={p.arrangement_hold ? "amber" : "green"}>
                    {p.arrangement_hold ? "On Hold" : "Will Pay"}
                  </Chip>
                </button>
                <form action={removeFromArrangement}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="text-xs text-muted hover:text-red-600" title="Remove from list">
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-muted">{pending ? "Saving…" : "Will Pay total"}</span>
            <span className="font-semibold tabular-nums">{formatMYR(payTotal)}</span>
          </div>
        </>
      )}
    </Card>
  );
}
