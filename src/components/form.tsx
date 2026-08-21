"use client";

import {
  createContext,
  useContext,
  useActionState,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, cn } from "@/components/ui";
import { todayISO } from "@/lib/finance/dates";

export type ActionState = { ok?: boolean; error?: string } | null;

// ---------------------------------------------------------------- fields
export function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-text">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const inputBase =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-indigo-100";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputBase, props.className)} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputBase, "min-h-20", props.className)} />;
}
export function Select({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select {...props} className={cn(inputBase, props.className)}>
      {children}
    </select>
  );
}
export function MoneyInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
        RM
      </span>
      <Input type="number" step="0.01" min="0" {...props} className={cn("pl-9", props.className)} />
    </div>
  );
}

/** Date input with a quick "Today" button. */
export function DateWithToday({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  return (
    <div className="flex gap-2">
      <Input type="date" name={name} value={value} onChange={(e) => setValue(e.target.value)} />
      <button type="button" className={buttonClass("secondary")} onClick={() => setValue(todayISO())}>
        Today
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- submit
export function SubmitButton({
  children = "Save",
  variant = "primary",
}: {
  children?: ReactNode;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass(variant)}>
      {pending ? "Working…" : children}
    </button>
  );
}

/** Submit button for a plain server-action <form> (one-click actions). */
export function InlineSubmit({
  children,
  variant = "secondary",
  confirm,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={cn(buttonClass(variant), "text-xs")}
    >
      {pending ? "…" : children}
    </button>
  );
}

// ---------------------------------------------------------------- drawer
const DrawerCtx = createContext<{ close: () => void }>({ close: () => {} });
export const useDrawer = () => useContext(DrawerCtx);

/**
 * Slide-over form. Wraps a server action (useActionState signature) and closes
 * automatically when the action returns { ok: true }.
 */
export function FormDrawer({
  triggerLabel,
  triggerVariant = "primary",
  title,
  description,
  action,
  children,
  submitLabel = "Save",
  width = "max-w-lg",
}: {
  triggerLabel: ReactNode;
  triggerVariant?: "primary" | "secondary" | "danger";
  title: string;
  description?: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel?: string;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, null);
  const titleId = useId();

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button className={buttonClass(triggerVariant)} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cn(
              "relative flex h-full w-full flex-col overflow-y-auto bg-surface shadow-xl",
              width,
            )}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-surface px-6 py-4">
              <div>
                <h2 id={titleId} className="text-lg font-semibold">
                  {title}
                </h2>
                {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted hover:bg-gray-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <DrawerCtx.Provider value={{ close: () => setOpen(false) }}>
              <form action={formAction} className="flex flex-1 flex-col gap-4 px-6 py-5">
                {children}
                {state?.error && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {state.error}
                  </p>
                )}
                <div className="mt-2 flex justify-end gap-2 border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className={buttonClass("secondary")}
                  >
                    Cancel
                  </button>
                  <SubmitButton>{submitLabel}</SubmitButton>
                </div>
              </form>
            </DrawerCtx.Provider>
          </div>
        </div>
      )}
    </>
  );
}
