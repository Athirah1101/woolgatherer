// Aging breakdown bar chart (server component — no hooks). Shows how much money
// sits in each overdue-age bucket. Used by Payables (aged payables) and
// Receivables (aged receivables).

import { Card } from "@/components/ui";
import { formatMYR } from "@/lib/finance/money";

export interface AgingBucket {
  label: string;
  amount: number; // ringgit
  tone: "green" | "amber" | "orange" | "red";
}

const BAR: Record<AgingBucket["tone"], string> = {
  green: "bg-emerald-400",
  amber: "bg-amber-400",
  orange: "bg-orange-400",
  red: "bg-red-400",
};

/** Standard aging buckets from a list of owed items. `daysOverdue` is 0 when not
 * yet due (or not past); `notDue` amounts always land in "Current". */
export function buildAging(
  items: { amount: number; daysOverdue: number }[],
): AgingBucket[] {
  const b = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
  for (const { amount, daysOverdue } of items) {
    if (amount <= 0) continue;
    if (daysOverdue <= 0) b.current += amount;
    else if (daysOverdue <= 30) b.d30 += amount;
    else if (daysOverdue <= 60) b.d60 += amount;
    else if (daysOverdue <= 90) b.d90 += amount;
    else b.d90p += amount;
  }
  return [
    { label: "Current", amount: b.current, tone: "green" },
    { label: "1–30 days", amount: b.d30, tone: "amber" },
    { label: "31–60 days", amount: b.d60, tone: "orange" },
    { label: "61–90 days", amount: b.d90, tone: "red" },
    { label: "90+ days", amount: b.d90p, tone: "red" },
  ];
}

export function AgingChart({
  title,
  buckets,
}: {
  title: string;
  buckets: AgingBucket[];
}) {
  const max = Math.max(...buckets.map((b) => b.amount), 1);
  const total = buckets.reduce((s, b) => s + b.amount, 0);
  const overdue = buckets.filter((b) => b.label !== "Current").reduce((s, b) => s + b.amount, 0);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
          <p className="mt-0.5 text-sm text-muted">
            Outstanding <span className="font-semibold text-text tabular-nums">{formatMYR(total)}</span>
            {overdue > 0 && (
              <>
                {" · "}overdue <span className="font-semibold text-red-600 tabular-nums">{formatMYR(overdue)}</span>
              </>
            )}
          </p>
        </div>
      </div>
      {total === 0 ? (
        <p className="text-sm text-muted">Nothing outstanding. 🎉</p>
      ) : (
        <div className="space-y-2">
          {buckets.map((b) => (
            <div key={b.label} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm text-muted">{b.label}</span>
              <div className="h-5 flex-1 overflow-hidden rounded bg-gray-100">
                <div
                  className={`h-full rounded ${BAR[b.tone]} transition-all`}
                  style={{ width: `${b.amount > 0 ? Math.max(2, (b.amount / max) * 100) : 0}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-sm font-medium tabular-nums">
                {formatMYR(b.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
