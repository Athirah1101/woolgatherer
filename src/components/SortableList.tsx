"use client";

import { Fragment, useState, type ReactNode } from "react";
import { Card, Table, TBody, THead, cn } from "@/components/ui";
import { ComboSelect } from "@/components/form";
import type { TableSortOption } from "@/components/TableSort";

export interface SortableRow {
  key: string;
  /** Lowercased text matched by the search box. */
  search: string;
  /** Values keyed by TableSortOption.field. */
  sortKeys: Record<string, string | number>;
  /** Which view keys this row belongs to (besides "all"). */
  tags?: string[];
  /** The already-rendered <TR> for this row. */
  node: ReactNode;
}

export interface ViewTab {
  key: string;
  label: string;
  count: number;
}

/**
 * A search + sort (+ optional view tabs) table whose ordering, filtering and
 * view switching are all owned by React state — no page reloads, no scroll
 * jumps, and it stays consistent when a row is edited and the server re-renders.
 * Server components render each row into `rows[].node`; this only reorders,
 * filters and shows/hides them.
 *
 * When `views` is given, tabs are rendered on the left and the wrapper gets
 * `data-view={activeView}` so view-specific columns can be shown/hidden in CSS
 * (e.g. `.paid-col`). The "all" view key shows every row.
 */
export function SortableList({
  toolbarLeft,
  views,
  rows,
  sorts,
  searchPlaceholder = "Search…",
  head,
  colSpan,
  emptyMessage = "Nothing matches your search.",
}: {
  toolbarLeft?: ReactNode;
  views?: ViewTab[];
  rows: SortableRow[];
  sorts?: TableSortOption[];
  searchPlaceholder?: string;
  head: ReactNode;
  colSpan: number;
  emptyMessage?: string;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(sorts?.[0]?.value ?? "");
  const [activeView, setActiveView] = useState(views?.[0]?.key ?? "");

  let list =
    views && views.length
      ? rows.filter((r) => activeView === "all" || (r.tags?.includes(activeView) ?? false))
      : rows;

  const query = q.trim().toLowerCase();
  if (query) list = list.filter((r) => r.search.includes(query));

  const opt = sorts?.find((s) => s.value === sort);
  if (opt) {
    const dir = opt.dir === "desc" ? -1 : 1;
    list = [...list].sort((a, b) => {
      const av = a.sortKeys[opt.field];
      const bv = b.sortKeys[opt.field];
      const cmp =
        opt.type === "number"
          ? (Number(av) || 0) - (Number(bv) || 0)
          : String(av ?? "").localeCompare(String(bv ?? ""));
      return cmp * dir;
    });
  }

  return (
    <div data-view={activeView}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {views
            ? views.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setActiveView(v.key)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-medium transition",
                    activeView === v.key
                      ? "bg-brand text-white"
                      : "border border-border bg-surface hover:bg-gray-50",
                  )}
                >
                  {v.label} <span className="opacity-70">({v.count})</span>
                </button>
              ))
            : toolbarLeft}
        </div>
        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-56 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {sorts && sorts.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-muted">
              <span className="whitespace-nowrap">Sort by</span>
              <ComboSelect defaultValue={sorts[0].value} onValueChange={setSort} className="w-52">
                {sorts.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </ComboSelect>
            </label>
          )}
        </div>
      </div>

      <Card padded={false}>
        <Table>
          <THead>{head}</THead>
          <TBody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              list.map((r) => <Fragment key={r.key}>{r.node}</Fragment>)
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
