"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/components/ui";

const PERIODS = [
  { key: "this_month", label: "This Month" },
  { key: "next_month", label: "Next Month" },
  { key: "3_months", label: "3 Months" },
  { key: "custom", label: "Custom" },
];

export function PeriodPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const period = params.get("period") ?? "this_month";

  function go(next: URLSearchParams) {
    router.push(`${pathname}?${next.toString()}`);
  }
  function setPeriod(key: string) {
    const next = new URLSearchParams(params.toString());
    next.set("period", key);
    go(next);
  }
  function setDate(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    next.set("period", "custom");
    if (value) next.set(key, value);
    else next.delete(key);
    go(next);
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => setPeriod(p.key)}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm font-medium transition",
            period === p.key ? "bg-brand text-white" : "border border-border bg-surface hover:bg-gray-50",
          )}
        >
          {p.label}
        </button>
      ))}
      {period === "custom" && (
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            defaultValue={params.get("from") ?? ""}
            onChange={(e) => setDate("from", e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1.5"
          />
          <span className="text-muted">to</span>
          <input
            type="date"
            defaultValue={params.get("to") ?? ""}
            onChange={(e) => setDate("to", e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1.5"
          />
        </div>
      )}
    </div>
  );
}
