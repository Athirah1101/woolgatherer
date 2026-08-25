"use client";

import { useActionState, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { buttonClass } from "@/components/ui";
import { Field, Textarea, SubmitButton } from "@/components/form";
import { submitFeedback } from "@/app/(app)/feedback/actions";

/** "Send Feedback" — opens a small centered popup (not the side drawer). */
export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(submitFeedback, null);

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
      <button className={buttonClass("secondary")} onClick={() => setOpen(true)}>
        💬 Send Feedback
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md rounded-xl border border-border bg-surface shadow-xl"
          >
            <div className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">Send Feedback</h2>
                <p className="mt-0.5 text-sm text-muted">Spotted a bug or have an idea? Let us know.</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted hover:bg-gray-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <form action={formAction} className="flex flex-col gap-4 px-5 py-5">
              <input type="hidden" name="page" value={pathname} />
              <Field label="Your feedback" required>
                <Textarea name="message" required placeholder="What's on your mind?" autoFocus />
              </Field>
              {state?.error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className={buttonClass("secondary")}>
                  Cancel
                </button>
                <SubmitButton>Send</SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
