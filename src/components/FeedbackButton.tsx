"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { buttonClass, cn } from "@/components/ui";
import { Field, Input, Textarea, SubmitButton } from "@/components/form";
import { submitFeedback } from "@/app/(app)/feedback/actions";

const TYPES = [
  { value: "bug", label: "Bug Report", icon: "🐞", hint: "Something isn't working right." },
  { value: "suggestion", label: "Suggestion", icon: "💡", hint: "An idea to make FinanceOS better." },
  { value: "note", label: "General Note", icon: "💬", hint: "Any other message or comment." },
] as const;

/** "Send Feedback" — centered popup with a type picker, subject, and attachment. */
export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>("bug");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, formAction] = useActionState(submitFeedback, null);
  // Only portal on the client (document exists after mount).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      setType("bug");
      setFileName(null);
    }
  }, [state]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const activeHint = TYPES.find((t) => t.value === type)?.hint;

  return (
    <>
      <button className={buttonClass("secondary")} onClick={() => setOpen(true)}>
        💬 Send Feedback
      </button>
      {open && mounted && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
          >
            <div className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">Send Feedback</h2>
                <p className="mt-0.5 text-sm text-muted">Goes straight to Athirah.</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted hover:bg-gray-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form action={formAction} className="flex min-h-0 flex-col">
              <div className="flex flex-col gap-4 overflow-y-auto px-5 py-5">
                <input type="hidden" name="page" value={pathname} />
                <input type="hidden" name="type" value={type} />

                {/* Type picker */}
                <div>
                  <p className="mb-1.5 text-sm font-medium">Type</p>
                  <div className="grid grid-cols-3 gap-2">
                    {TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setType(t.value)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-sm font-medium transition",
                          type === t.value
                            ? "border-transparent bg-gray-900 text-white"
                            : "border-border bg-surface text-text hover:bg-gray-50",
                        )}
                      >
                        <span className="text-lg leading-none">{t.icon}</span>
                        <span className="text-center leading-tight">{t.label}</span>
                      </button>
                    ))}
                  </div>
                  {activeHint && <p className="mt-1.5 text-xs text-muted">{activeHint}</p>}
                </div>

                <Field label="Subject (optional)">
                  <Input name="subject" placeholder="Brief summary…" maxLength={120} />
                </Field>

                <Field label="Message" required>
                  <Textarea name="message" required placeholder="Describe it here…" autoFocus />
                </Field>

                {/* Attachment */}
                <div>
                  <p className="mb-1.5 text-sm font-medium">
                    Attachment <span className="font-normal text-muted">(optional — screenshot or screen recording)</span>
                  </p>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted hover:bg-gray-50">
                    <span>📎</span>
                    <span className="truncate">{fileName ?? "Attach a screenshot or screen recording"}</span>
                    <input
                      ref={fileRef}
                      type="file"
                      name="attachment"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                    />
                  </label>
                  {fileName && (
                    <button
                      type="button"
                      onClick={() => {
                        if (fileRef.current) fileRef.current.value = "";
                        setFileName(null);
                      }}
                      className="mt-1 text-xs text-muted underline hover:text-text"
                    >
                      Remove attachment
                    </button>
                  )}
                  <p className="mt-1 text-xs text-muted">Max ~10MB.</p>
                </div>

                {state?.error && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
                <button type="button" onClick={() => setOpen(false)} className={buttonClass("secondary")}>
                  Cancel
                </button>
                <SubmitButton>Send Feedback</SubmitButton>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
