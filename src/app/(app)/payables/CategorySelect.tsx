"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";
import { createPayableCategory } from "./actions";

type Cat = { id: string; name: string };

const inputBase =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-indigo-100";

/**
 * Category picker for the payable form. Same look as ComboSelect, but with an
 * "+ Add new category…" row at the bottom of the menu that creates a payable
 * category on the spot and selects it — no trip to Settings needed.
 */
export function CategorySelect({
  name = "category_id",
  defaultValue = "",
  cats,
}: {
  name?: string;
  defaultValue?: string;
  cats: Cat[];
}) {
  const [options, setOptions] = useState<Cat[]>(cats);
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setAdding(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Focus the "new category" input as soon as it appears.
  useEffect(() => {
    if (adding) addInputRef.current?.focus();
  }, [adding]);

  const selected = options.find((o) => o.id === value);

  async function addNew() {
    const clean = newName.trim();
    if (!clean) return;
    setPending(true);
    setError(null);
    const res = await createPayableCategory(clean);
    setPending(false);
    if (res.error || !res.id) {
      setError(res.error ?? "Could not add category");
      return;
    }
    // Add (or reuse) then select it.
    setOptions((cur) =>
      cur.some((c) => c.id === res.id) ? cur : [...cur, { id: res.id!, name: res.name ?? clean }],
    );
    setValue(res.id);
    setNewName("");
    setAdding(false);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(inputBase, "flex items-center justify-between text-left")}
      >
        <span className={cn("truncate", !selected && "text-muted")}>
          {selected ? selected.name : "—"}
        </span>
        <span className={cn("ml-2 shrink-0 text-xs text-muted transition-transform", open && "rotate-180")}>
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="combo-in absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-auto rounded-lg border border-border bg-surface p-1 shadow-lg"
        >
          {/* "None" option */}
          <button
            type="button"
            onClick={() => {
              setValue("");
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition hover:bg-gray-100",
              value === "" && "bg-indigo-50 font-medium text-brand",
            )}
          >
            <span className="truncate text-muted">—</span>
            {value === "" && <span className="ml-2 text-brand">✓</span>}
          </button>

          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === value}
              onClick={() => {
                setValue(o.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition hover:bg-gray-100",
                o.id === value && "bg-indigo-50 font-medium text-brand",
              )}
            >
              <span className="truncate">{o.name}</span>
              {o.id === value && <span className="ml-2 text-brand">✓</span>}
            </button>
          ))}

          {/* Add-new footer */}
          <div className="mt-1 border-t border-border pt-1">
            {adding ? (
              <div className="px-1 py-1">
                <input
                  ref={addInputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addNew();
                    }
                  }}
                  placeholder="New category name…"
                  className={cn(inputBase, "mb-1")}
                />
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(false);
                      setNewName("");
                      setError(null);
                    }}
                    className="rounded-md px-2 py-1 text-xs text-muted hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void addNew()}
                    disabled={pending || !newName.trim()}
                    className="rounded-md bg-brand px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {pending ? "Adding…" : "Add"}
                  </button>
                </div>
                {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-brand transition hover:bg-indigo-50"
              >
                <span className="text-base leading-none">＋</span>
                <span>Add new category…</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
