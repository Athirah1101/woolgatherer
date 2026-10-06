"use client";

// Collapsible boards on the Payables page. Every board has its own slim title
// bar that folds it away, and a master button hides / shows all of them. What
// you collapse is remembered in this browser.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { buttonClass } from "@/components/ui";

const KEY = "payables-hidden-boards";

interface BoardsCtx {
  ids: string[];
  hiddenIds: string[];
  toggle: (id: string) => void;
  setAll: (hide: boolean) => void;
}
const Ctx = createContext<BoardsCtx>({ ids: [], hiddenIds: [], toggle: () => {}, setAll: () => {} });

export function BoardsProvider({ ids, children }: { ids: string[]; children: ReactNode }) {
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setHiddenIds(JSON.parse(raw) as string[]);
    } catch {
      /* storage unavailable — everything stays shown */
    }
  }, []);
  function save(next: string[]) {
    setHiddenIds(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  const toggle = (id: string) =>
    save(hiddenIds.includes(id) ? hiddenIds.filter((x) => x !== id) : [...hiddenIds, id]);
  const setAll = (hide: boolean) => save(hide ? [...ids] : []);
  return <Ctx.Provider value={{ ids, hiddenIds, toggle, setAll }}>{children}</Ctx.Provider>;
}

/** Master button: hides every board, or shows them all again. */
export function BoardsToggleButton() {
  const { ids, hiddenIds, setAll } = useContext(Ctx);
  const allHidden = ids.length > 0 && ids.every((id) => hiddenIds.includes(id));
  return (
    <button
      type="button"
      onClick={() => setAll(!allHidden)}
      className={buttonClass("secondary")}
      title={allHidden ? "Show all the boards" : "Hide all the boards to see more of the list"}
    >
      {allHidden ? "▾ Show all boards" : "▴ Hide all boards"}
    </button>
  );
}

/** One board with its own fold-away title bar. Hidden with CSS so state is kept. */
export function BoardsSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const { hiddenIds, toggle } = useContext(Ctx);
  const hidden = hiddenIds.includes(id);
  return (
    <section className="mb-6">
      <button
        type="button"
        onClick={() => toggle(id)}
        aria-expanded={!hidden}
        className="mb-2 flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-xs font-semibold uppercase tracking-wide text-muted hover:bg-surface"
      >
        <span aria-hidden>{hidden ? "▸" : "▾"}</span>
        <span>{title}</span>
        <span className="ml-auto font-normal normal-case tracking-normal">{hidden ? "Show" : "Hide"}</span>
      </button>
      <div className={hidden ? "hidden" : undefined}>{children}</div>
    </section>
  );
}
