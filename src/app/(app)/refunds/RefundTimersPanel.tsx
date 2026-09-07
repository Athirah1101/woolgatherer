"use client";

import { useState } from "react";
import { AttentionBadge, Card, cn, type Tone } from "@/components/ui";
import { formatMYR } from "@/lib/finance/money";
import { SinceTimer } from "./SinceTimer";

export interface TimerItem {
  id: string;
  clientName: string;
  remaining: number;
  receivedDate: string; // ISO date HRDC funds landed
  attnText: string | null;
  attnColor: "red" | "orange" | "yellow" | "green" | null;
  attnTone: Tone | null;
  days: number | null; // days until deadline (negative = overdue); null = no deadline
}

type SortKey = "urgency" | "waiting" | "amount" | "name";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "urgency", label: "Most urgent" },
  { key: "waiting", label: "Longest waiting" },
  { key: "amount", label: "Highest amount" },
  { key: "name", label: "Client A–Z" },
];

function sortItems(items: TimerItem[], key: SortKey): TimerItem[] {
  const copy = [...items];
  switch (key) {
    case "waiting":
      // Longest time since HRDF received = earliest received date first.
      return copy.sort((a, b) => a.receivedDate.localeCompare(b.receivedDate));
    case "amount":
      return copy.sort((a, b) => b.remaining - a.remaining);
    case "name":
      return copy.sort((a, b) => a.clientName.localeCompare(b.clientName));
    case "urgency":
    default:
      // Soonest / most-overdue deadline first; no deadline sinks to the bottom.
      return copy.sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));
  }
}

/**
 * The "Time Since HRDF Received" side panel: live count-up timers with
 * user-pickable sort. Sorting happens instantly in the browser so the timers
 * keep ticking — no page reload.
 */
export function RefundTimersPanel({ items }: { items: TimerItem[] }) {
  const [sort, setSort] = useState<SortKey>("urgency");

  if (items.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">
          No active refunds. Timers appear here the moment HRD Corp funds are received.
        </p>
      </Card>
    );
  }

  const sorted = sortItems(items, sort);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSort(s.key)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition",
              sort === s.key
                ? "bg-brand text-white"
                : "border border-border bg-surface text-muted hover:bg-gray-50",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {sorted.map((r) => (
          <Card
            key={r.id}
            className={cn(
              "border-l-4",
              r.attnColor === "red" && "border-l-red-500",
              r.attnColor === "orange" && "border-l-orange-500",
              r.attnColor === "yellow" && "border-l-amber-400",
              r.attnColor === "green" && "border-l-emerald-500",
              !r.attnColor && "border-l-border",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{r.clientName}</span>
              <span className="text-sm text-muted">{formatMYR(r.remaining)}</span>
            </div>
            <div className="mt-2 text-lg">
              <SinceTimer since={r.receivedDate} />
            </div>
            {r.attnText && r.attnTone && (
              <div className="mt-2">
                <AttentionBadge label={r.attnText} tone={r.attnTone} />
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
