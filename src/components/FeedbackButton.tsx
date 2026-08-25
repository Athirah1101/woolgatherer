"use client";

import { usePathname } from "next/navigation";
import { FormDrawer, Field, Textarea } from "@/components/form";
import { submitFeedback } from "@/app/(app)/feedback/actions";

/** "Send Feedback" trigger — available to every signed-in user. */
export function FeedbackButton() {
  const pathname = usePathname();
  return (
    <FormDrawer
      triggerLabel="💬 Send Feedback"
      triggerVariant="secondary"
      title="Send Feedback"
      description="Spotted a bug or have an idea? Tell the finance team."
      action={submitFeedback}
      submitLabel="Send"
    >
      <input type="hidden" name="page" value={pathname} />
      <Field label="Your feedback" required>
        <Textarea name="message" required placeholder="What's on your mind?" />
      </Field>
    </FormDrawer>
  );
}
