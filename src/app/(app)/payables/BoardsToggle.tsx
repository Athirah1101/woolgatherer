"use client";

// Lets the big boards at the top of Payables (summary cards, aging chart,
// Payment Priority List) be collapsed so the payables list gets the whole
// screen. The choice is remembered in this browser.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { buttonClass } from "@/components/ui";

const KEY = "payables-hide-boards";
const Ctx = createContext<{ hidden: boolean; toggle: () => void }>({ hidden: false, toggle: () => {} });

export function BoardsProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY) === "1");
    } catch {
      /* storage unavailable — default to shown */
    }
  }, []);
  function toggle() {
    setHidden((h) => {
      try {
        localStorage.setItem(KEY, h ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !h;
    });
  }
  return <Ctx.Provider value={{ hidden, toggle }}>{children}</Ctx.Provider>;
}

export function BoardsToggleButton() {
  const { hidden, toggle } = useContext(Ctx);
  return (
    <button
      type="button"
      onClick={toggle}
      className={buttonClass("secondary")}
      aria-expanded={!hidden}
      title={hidden ? "Show the summary cards, chart and Payment Priority List" : "Hide them to see more of the list"}
    >
      {hidden ? "▾ Show boards" : "▴ Hide boards"}
    </button>
  );
}

/** Wraps the collapsible boards. Hidden with CSS so their state isn't lost. */
export function BoardsSection({ children }: { children: ReactNode }) {
  const { hidden } = useContext(Ctx);
  return <div className={hidden ? "hidden" : undefined}>{children}</div>;
}
