"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const QUICK = [
  { key: "", label: "All" },
  { key: "outstanding", label: "Outstanding" },
  { key: "overdue", label: "Overdue" },
  { key: "due_week", label: "Due This Week" },
  { key: "due_month", label: "Due This Month" },
  { key: "paid", label: "Paid" },
];

export function FilterBar({
  salesPics,
  showSalesPic,
}: {
  salesPics: string[];
  showSalesPic: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  }

  const quick = params.get("quick") ?? "";

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q.key}
            onClick={() => set("quick", q.key)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition",
              quick === q.key ? "bg-brand text-white" : "bg-surface border border-border hover:bg-gray-50",
            )}
          >
            {q.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          defaultValue={params.get("q") ?? ""}
          onChange={(e) => set("q", e.target.value)}
          placeholder="Search client or product…"
          className="w-56 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
        {showSalesPic && (
          <select
            value={params.get("pic") ?? ""}
            onChange={(e) => set("pic", e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="">All Sales PICs</option>
            {salesPics.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}
        <select
          value={params.get("hrdc") ?? ""}
          onChange={(e) => set("hrdc", e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        >
          <option value="">HRDC & Non-HRDC</option>
          <option value="yes">HRDC only</option>
          <option value="no">Non-HRDC only</option>
        </select>
      </div>
    </div>
  );
}
