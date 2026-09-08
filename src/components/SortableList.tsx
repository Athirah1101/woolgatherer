"use client";

import { Fragment, useState, type ReactNode } from "react";
import { Card, Table, TBody, THead } from "@/components/ui";
import { ComboSelect } from "@/components/form";
import type { TableSortOption } from "@/components/TableSort";

export interface SortableRow {
  key: string;
  /** Lowercased text matched by the search box. */
  search: string;
  /** Values keyed by TableSortOption.field. */
  sortKeys: Record<string, string | number>;
  /** The already-rendered <TR> for this row. */
  node: ReactNode;
}

/**
 * A search + sort table whose ordering and filtering are owned by React state
 * (not imperative DOM edits), so it stays consistent when a row is edited and
 * the server re-renders the list. Server components render each row into
 * `rows[].node`; this only reorders/filters them.
 */
export function SortableList({
  toolbarLeft,
  rows,
  sorts,
  searchPlaceholder = "Search…",
  head,
  colSpan,
  emptyMessage = "Nothing matches your search.",
}: {
  toolbarLeft?: ReactNode;
  rows: SortableRow[];
  sorts?: TableSortOption[];
  searchPlaceholder?: string;
  head: ReactNode;
  colSpan: number;
  emptyMessage?: string;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(sorts?.[0]?.value ?? "");

  const query = q.trim().toLowerCase();
  let list = query ? rows.filter((r) => r.search.includes(query)) : rows;

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
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">{toolbarLeft}</div>
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
    </>
  );
}
