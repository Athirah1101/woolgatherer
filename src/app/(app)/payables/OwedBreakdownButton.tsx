"use client";

// "View breakdown" for the Owed to directors cards: a read-only popup listing
// every amount that makes up what we owe that person.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { buttonClass } from "@/components/ui";
import { formatMYR } from "@/lib/finance/money";
import { formatDate } from "@/lib/finance/dates";
import type { BreakdownLine, OwedBreakdown } from "@/lib/data/owedBreakdown";

const dateText = (d: string | null) => (d ? (/^\d{4}-\d{2}-\d{2}$/.test(d) ? formatDate(d) : d) : "");

function Section({ title, hint, lines, total, tone }: {
  title: string; hint?: string; lines: BreakdownLine[]; total?: number; tone?: "warn";
}) {
  if (lines.length === 0) return null;
  return (
    <section className={`rounded-lg border p-3 ${tone === "warn" ? "border-amber-300 bg-amber-50/60" : "border-border"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {total != null && <span className="text-sm font-semibold tabular-nums">{formatMYR(total)}</span>}
      </div>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <ul className="mt-2 divide-y divide-border text-sm">
        {lines.map((l, i) => (
          <li key={i} className="flex items-start justify-between gap-3 py-1.5">
            <div className="min-w-0">
              <div>{l.name}</div>
              {(l.date || l.note) && (
                <div className="text-xs text-muted">{[dateText(l.date), l.note].filter(Boolean).join(" · ")}</div>
              )}
            </div>
            <div className="whitespace-nowrap font-medium tabular-nums">{formatMYR(l.amount)}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OwedBreakdownButton({ data }: { data: OwedBreakdown }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const sum = (ls: BreakdownLine[]) => ls.reduce((s, l) => s + l.amount, 0);
  let body: ReactNode = null;
  if (open) {
    body = createPortal(
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} aria-hidden />
        <div role="dialog" aria-modal="true" className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-surface shadow-xl">
          <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-surface px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold">Owed to {data.who}</h2>
              <p className="mt-0.5 text-sm text-muted">Everything that makes up the total, in one place.</p>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-md p-1 text-muted hover:bg-gray-100" aria-label="Close">✕</button>
          </div>
          <div className="space-y-4 px-6 py-5">
            <div className="flex items-baseline justify-between rounded-lg bg-indigo-50 px-4 py-3">
              <span className="text-sm font-medium">Total we owe {data.who}</span>
              <span className="text-xl font-semibold tabular-nums text-indigo-700">{formatMYR(data.total)}</span>
            </div>
            <Section title="Owed to him directly" hint="Money we owe him himself (e.g. Capital). Shows what's left after part-payments." lines={data.owed} total={sum(data.owed)} />
            <Section title="Bills paid on the company's behalf" hint={`Bills paid with ${data.who}'s own money (payment method “${data.who}”). One payback line for all of them.`} lines={data.payback} total={data.paybackTotal} />
            <Section tone="warn" title="Check: paid via his method but not in the list above" hint="These were paid with his method but aren't part of the payback total. If we owe him for them, the total is short; if already repaid, ignore." lines={data.notInPayback} total={sum(data.notInPayback)} />
            <Section title="Lined up to be paid via his method" hint="Not paid yet, so not owed yet. They join the payback once you mark them paid." lines={data.upcoming} total={sum(data.upcoming)} />
            <Section title="Paid back to him so far" lines={data.repaid} total={sum(data.repaid)} />
            <Section title="Cancelled (not counted)" lines={data.cancelled} />
          </div>
        </div>
      </div>,
      document.body,
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary") + " mt-2 w-full"}>
        View breakdown
      </button>
      {body}
    </>
  );
}
