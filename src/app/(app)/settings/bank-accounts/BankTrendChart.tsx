"use client";

import { useMemo, useState } from "react";
import { Card, cn } from "@/components/ui";
import { formatMYR, formatMYRCompact } from "@/lib/finance/money";
import type { CashPoint } from "@/lib/data/cashHistory";

type View = "daily" | "weekly" | "monthly";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Monday of the week containing an ISO date. */
function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

interface Bucket {
  key: string;
  label: string;
  total: number;
}

function bucketize(points: CashPoint[], view: View): Bucket[] {
  const map = new Map<string, { label: string; total: number }>();
  for (const p of points) {
    if (view === "daily") {
      const d = new Date(`${p.day}T00:00:00`);
      map.set(p.day, { label: `${d.getDate()} ${MONTHS[d.getMonth()]}`, total: p.total });
    } else if (view === "weekly") {
      const ws = weekStart(p.day);
      const d = new Date(`${ws}T00:00:00`);
      map.set(ws, { label: `${d.getDate()} ${MONTHS[d.getMonth()]}`, total: p.total });
    } else {
      const key = p.day.slice(0, 7); // YYYY-MM
      const [y, m] = key.split("-");
      map.set(key, { label: `${MONTHS[Number(m) - 1]} ${y.slice(2)}`, total: p.total });
    }
  }
  const buckets = [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, v]) => ({ key, label: v.label, total: v.total }));
  return buckets.slice(view === "daily" ? -14 : -12); // last 14 days / 12 periods
}

export function BankTrendChart({ points }: { points: CashPoint[] }) {
  const [view, setView] = useState<View>("daily");
  const buckets = useMemo(() => bucketize(points, view), [points, view]);

  if (points.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">
          No balance history yet. Each time a balance updates (manually or via the daily sync), a snapshot is
          recorded here — your trend will build up from today.
        </p>
      </Card>
    );
  }

  const max = Math.max(...buckets.map((b) => b.total), 1);
  const latest = buckets[buckets.length - 1]?.total ?? 0;

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Total Cash Trend</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">{formatMYR(latest)}</p>
        </div>
        <div className="flex rounded-lg border border-border p-0.5 text-sm">
          {(["daily", "weekly", "monthly"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3 py-1 font-medium capitalize transition",
                view === v ? "bg-brand text-white" : "text-muted hover:bg-gray-100",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex h-48 items-end gap-1.5 overflow-x-auto">
        {buckets.map((b) => (
          <div key={b.key} className="flex min-w-8 flex-1 flex-col items-center gap-1">
            <span className="text-[10px] font-medium tabular-nums text-muted">{formatMYRCompact(b.total)}</span>
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t bg-brand/80 transition-all hover:bg-brand"
                style={{ height: `${Math.max(4, (b.total / max) * 100)}%` }}
                title={`${b.label}: ${formatMYR(b.total)}`}
              />
            </div>
            <span className="whitespace-nowrap text-[10px] text-muted">{b.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
