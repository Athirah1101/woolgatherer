"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Card, Chip, buttonClass } from "@/components/ui";
import { formatMYR } from "@/lib/finance/money";
import { formatDate } from "@/lib/finance/dates";
import { owedAmount } from "@/lib/finance/payables";
import type { Payable, PaymentMethod } from "@/lib/types";
import { MarkPaid } from "./MarkPaid";
import {
  postPaymentsToLarkNow,
  removeFromArrangement,
  reorderArrangement,
  saveArrangementNotes,
  setArrangementHold,
  setArrangementKiv,
  setArrangementNote,
} from "./actions";

type Section = "priority" | "kiv";

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

export function ArrangementBoard({
  items: initial,
  notes,
  dateLabel,
  methods,
}: {
  items: Payable[];
  notes: string;
  dateLabel: string;
  methods: PaymentMethod[];
}) {
  const [items, setItems] = useState(initial);
  const [drag, setDrag] = useState<{ section: Section; index: number } | null>(null);
  const [pending, startTransition] = useTransition();

  // Adopt server updates (add/remove/paid) unless a reorder is mid-save.
  useEffect(() => {
    if (!pending) setItems(initial);
  }, [initial, pending]);

  const priority = items.filter((p) => !p.arrangement_kiv);
  const kiv = items.filter((p) => p.arrangement_kiv);

  // Persist a fresh order: priority first, then KIV, so the numbering is stable.
  function persist(nextPriority: Payable[], nextKiv: Payable[]) {
    const next = [...nextPriority, ...nextKiv];
    setItems(next);
    startTransition(() => reorderArrangement(next.map((a) => a.id)));
  }

  function onDrop(section: Section, target: number) {
    if (!drag || drag.section !== section || drag.index === target) return setDrag(null);
    const list = section === "priority" ? [...priority] : [...kiv];
    const [moved] = list.splice(drag.index, 1);
    list.splice(target, 0, moved);
    setDrag(null);
    if (section === "priority") persist(list, kiv);
    else persist(priority, list);
  }

  function toggleHold(p: Payable) {
    setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, arrangement_hold: !p.arrangement_hold } : x)));
    startTransition(() => setArrangementHold(p.id, !p.arrangement_hold));
  }

  function toggleKiv(p: Payable) {
    const kivNext = !p.arrangement_kiv;
    setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, arrangement_kiv: kivNext } : x)));
    startTransition(() => setArrangementKiv(p.id, kivNext));
  }

  const payTotal = priority
    .filter((p) => !p.arrangement_hold)
    .reduce((sum, p) => sum + owedAmount(p), 0);
  const kivTotal = kiv.reduce((sum, p) => sum + owedAmount(p), 0);

  function row(p: Payable, i: number, section: Section) {
    return (
      <li
        key={p.id}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => onDrop(section, i)}
        className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2.5 last:border-0 ${
          drag?.section === section && drag.index === i ? "opacity-40" : ""
        } ${p.arrangement_hold ? "bg-amber-50/40" : ""}`}
      >
        <span
          draggable
          onDragStart={() => setDrag({ section, index: i })}
          onDragEnd={() => setDrag(null)}
          className="cursor-grab select-none text-muted"
          title="Drag to reorder"
        >
          ⋮⋮
        </span>
        <span className="w-5 text-right text-sm tabular-nums text-muted">{i + 1}.</span>
        <div className="min-w-[8rem] flex-1">
          <div className="text-sm font-medium">{p.description?.trim() || p.payee}</div>
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
        <MarkPaid p={p} methods={methods} triggerVariant="secondary" />
        {section === "priority" && (
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
        )}
        <button
          type="button"
          onClick={() => toggleKiv(p)}
          className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted hover:bg-surface"
          title={section === "kiv" ? "Move back to the Priority list" : "Move to KIV (keep in view — not paying this round)"}
        >
          {section === "kiv" ? "→ Priority" : "→ KIV"}
        </button>
        <form action={removeFromArrangement}>
          <input type="hidden" name="id" value={p.id} />
          <button type="submit" className="text-xs text-muted hover:text-red-600" title="Remove from list">
            ✕
          </button>
        </form>
      </li>
    );
  }

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{dateLabel} Payment Priority List</h2>
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
          {priority.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">Nothing in the priority list — everything below is KIV.</p>
          ) : (
            <ul>{priority.map((p, i) => row(p, i, "priority"))}</ul>
          )}
          <div className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-muted">{pending ? "Saving…" : "Will Pay total"}</span>
            <span className="font-semibold tabular-nums">{formatMYR(payTotal)}</span>
          </div>

          {/* KIV — due but not urgent. Shown separately; not counted in the pay-now total. */}
          {kiv.length > 0 && (
            <>
              <div className="border-t border-border bg-surface/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                KIV — Keep In View
              </div>
              <ul>{kiv.map((p, i) => row(p, i, "kiv"))}</ul>
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-muted">KIV total</span>
                <span className="font-semibold tabular-nums">{formatMYR(kivTotal)}</span>
              </div>
            </>
          )}
        </>
      )}

      {/* General notes appended to the message (Public Bank context, upcoming salary, etc.). */}
      <div className="border-t border-border px-4 py-3">
        <label className="mb-1 block text-xs font-semibold text-muted">
          Notes (added to the Lark message)
        </label>
        <textarea
          defaultValue={notes}
          onBlur={(e) => {
            if (e.target.value !== notes) startTransition(() => saveArrangementNotes(e.target.value));
          }}
          rows={3}
          placeholder={"- Public Bank has 133k but keep for salary\n- Upcoming salary + claims ≈ 120k\n- HRDC refund to Inox due in 7 days: RM32k"}
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        />
        <p className="mt-1 text-xs text-muted">Type each note on its own line — they appear under “Notes:” in the message.</p>
      </div>
    </Card>
  );
}
