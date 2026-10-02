"use client";

// "🕒 History" chip on payables that were paid bit by bit. Opens a small popup
// (on hover with a mouse, or on tap) listing every payment: date, amount,
// method and reference, plus the total paid and what's left.

import { useRef, useState } from "react";
import { formatMYR } from "@/lib/finance/money";
import { formatDate } from "@/lib/finance/dates";

export interface HistoryRow {
  date: string;
  amount: number;
  method: string | null;
  reference: string | null;
  note: string | null;
}

export function PaymentHistory({
  rows,
  paidTotal,
  total,
  title,
}: {
  rows: HistoryRow[];
  paidTotal: number;
  total: number;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (timer.current) clearTimeout(timer.current);
    const r = btn.current?.getBoundingClientRect();
    if (r) {
      const width = 340;
      const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
      const below = r.bottom + 6;
      const top = below + 260 > window.innerHeight ? Math.max(8, r.top - 6 - 260) : below;
      setPos({ top, left });
    }
    setOpen(true);
  }
  function hideSoon() {
    timer.current = setTimeout(() => setOpen(false), 150);
  }

  const itemised = rows.reduce((s, r) => s + r.amount, 0);
  const unlisted = Math.round((paidTotal - itemised) * 100) / 100;
  const left = Math.max(0, Math.round((total - paidTotal) * 100) / 100);

  return (
    <span className="inline-block" onMouseEnter={show} onMouseLeave={hideSoon}>
      <button
        ref={btn}
        type="button"
        onClick={() => (open ? setOpen(false) : show())}
        className="mt-1 rounded-md border border-border px-1.5 py-0.5 text-xs font-normal text-muted hover:bg-surface"
      >
        🕒 History ({rows.length + (unlisted > 0.005 ? 1 : 0)})
      </button>
      {open && pos && (
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 340, zIndex: 60 }}
          onMouseEnter={show}
          onMouseLeave={hideSoon}
          className="rounded-xl border border-border bg-surface p-3 text-left text-sm font-normal shadow-xl"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="font-semibold">{title}</div>
            <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-text" aria-label="Close">
              ✕
            </button>
          </div>
          <ul className="max-h-56 divide-y divide-border overflow-y-auto">
            {rows.map((r, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-1.5">
                <div>
                  <div className="whitespace-nowrap">{formatDate(r.date)}</div>
                  <div className="text-xs text-muted">
                    {[r.method, r.reference, r.note].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div className="whitespace-nowrap font-medium tabular-nums">{formatMYR(r.amount)}</div>
              </li>
            ))}
            {unlisted > 0.005 && (
              <li className="flex items-start justify-between gap-3 py-1.5">
                <div>
                  <div>Earlier payments</div>
                  <div className="text-xs text-muted">dates not recorded</div>
                </div>
                <div className="whitespace-nowrap font-medium tabular-nums">{formatMYR(unlisted)}</div>
              </li>
            )}
          </ul>
          <div className="mt-2 space-y-0.5 border-t border-border pt-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted">Total paid</span>
              <span className="font-semibold tabular-nums">{formatMYR(paidTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Still to pay</span>
              <span className="font-semibold tabular-nums">{formatMYR(left)}</span>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
