"use client";

import { useState } from "react";

/**
 * Instant, in-browser table filter — no page reload, no scroll jump. Filters
 * rows already rendered by the server: it shows/hides each `<tr data-search>`
 * under `targetId` whose data-search text contains the query. Matches the snappy
 * feel of the receivables search.
 *
 * The searchable text lives in each row's `data-search` attribute (set via the
 * TR `search` prop), so button labels and other chrome never cause false hits.
 */
export function TableSearch({
  targetId,
  placeholder = "Search…",
  className = "w-64",
}: {
  targetId: string;
  placeholder?: string;
  className?: string;
}) {
  const [value, setValue] = useState("");

  function apply(next: string) {
    setValue(next);
    const q = next.trim().toLowerCase();
    const root = document.getElementById(targetId);
    if (!root) return;
    let shown = 0;
    root.querySelectorAll<HTMLElement>("tr[data-search]").forEach((tr) => {
      const match = !q || (tr.dataset.search ?? "").includes(q);
      tr.hidden = !match;
      if (match) shown++;
    });
    const empty = document.getElementById(`${targetId}-empty`);
    if (empty) empty.hidden = !(q && shown === 0);
  }

  return (
    <input
      value={value}
      onChange={(e) => apply(e.target.value)}
      placeholder={placeholder}
      className={`rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand ${className}`}
    />
  );
}
