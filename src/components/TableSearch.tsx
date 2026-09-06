"use client";

import { useState } from "react";

/**
 * Instant, in-browser filter — no page reload, no scroll jump. Filters items
 * already rendered by the server: it shows/hides each element carrying a
 * `data-search` attribute under `targetId` whose text contains the query. Works
 * for table rows (`<tr data-search>`) and card lists (`<div data-search>`) alike.
 * Matches the snappy feel of the receivables search.
 *
 * The searchable text lives in each item's `data-search` attribute (set via the
 * TR `search` prop, or a wrapping div), so button labels and other chrome never
 * cause false hits.
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
    root.querySelectorAll<HTMLElement>("[data-search]").forEach((el) => {
      const match = !q || (el.dataset.search ?? "").includes(q);
      el.hidden = !match;
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
