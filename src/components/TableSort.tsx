"use client";

import { ComboSelect } from "@/components/form";

export interface TableSortOption {
  value: string;
  label: string;
  /** Which `data-sort-<field>` attribute on each row to sort by. */
  field: string;
  type?: "text" | "number";
  dir?: "asc" | "desc";
}

/**
 * Instant, in-browser table sort — no page reload, no scroll jump. Reorders the
 * `<tr data-search>` rows already rendered by the server under `targetId`,
 * reading each row's `data-sort-<field>` attribute. Pairs with TableSearch
 * (which hides non-matching rows); sorting preserves that hidden state.
 */
export function TableSort({
  targetId,
  options,
  label = "Sort by",
}: {
  targetId: string;
  options: TableSortOption[];
  label?: string;
}) {
  function apply(next: string) {
    const opt = options.find((o) => o.value === next) ?? options[0];
    const root = document.getElementById(targetId);
    const tbody = root?.querySelector("tbody");
    if (!tbody) return;

    const key = "sort" + opt.field.charAt(0).toUpperCase() + opt.field.slice(1);
    const dir = opt.dir === "desc" ? -1 : 1;
    const rows = Array.from(tbody.querySelectorAll<HTMLElement>("tr[data-search]"));
    rows.sort((a, b) => {
      const av = a.dataset[key] ?? "";
      const bv = b.dataset[key] ?? "";
      const cmp =
        opt.type === "number"
          ? (parseFloat(av) || 0) - (parseFloat(bv) || 0)
          : av.localeCompare(bv);
      return cmp * dir;
    });
    // Re-append in the new order (moves existing nodes, keeping their state).
    rows.forEach((r) => tbody.appendChild(r));
  }

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <span className="whitespace-nowrap">{label}</span>
      <ComboSelect defaultValue={options[0].value} onValueChange={apply} className="w-52">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </ComboSelect>
    </label>
  );
}
