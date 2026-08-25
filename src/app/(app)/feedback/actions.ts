"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth";
import type { ActionState } from "@/components/form";
import { sendNotification } from "@/lib/integrations/email";

const FEEDBACK_TYPES = new Set(["bug", "suggestion", "note"]);
const TYPE_LABEL: Record<string, string> = {
  bug: "Bug Report",
  suggestion: "Suggestion",
  note: "General Note",
};
const ATTACHMENT_BUCKET = "feedback-attachments";
const MAX_ATTACHMENT_BYTES = 11 * 1024 * 1024; // ~11MB (under the 12MB action limit)

/** Anyone signed in can submit feedback. Stored in-app + emailed to Athirah. */
export async function submitFeedback(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    const message = (fd.get("message") as string | null)?.trim() ?? "";
    const page = (fd.get("page") as string | null)?.trim() || null;
    const subject = (fd.get("subject") as string | null)?.trim() || null;
    const typeRaw = (fd.get("type") as string | null)?.trim() ?? "note";
    const type = FEEDBACK_TYPES.has(typeRaw) ? typeRaw : "note";
    if (!message) return { error: "Please write your feedback first." };

    const supabase = await createClient();
    const { data: inserted, error } = await supabase
      .from("feedback")
      .insert({ message, page, subject, type, submitted_by: session.userId })
      .select("id")
      .single();
    if (error) return { error: error.message };

    // Optional attachment (screenshot / screen recording) → private bucket.
    // Best-effort: a failed upload never blocks the feedback itself.
    let hasAttachment = false;
    const file = fd.get("attachment");
    if (file instanceof File && file.size > 0 && inserted?.id) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        return { error: "Attachment is too large (max ~10MB). Try a screenshot instead of a recording." };
      }
      try {
        const dot = file.name.lastIndexOf(".");
        const ext = dot >= 0 ? file.name.slice(dot) : "";
        const path = `${inserted.id}/attachment${ext}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const admin = createAdminClient();
        const { error: upErr } = await admin.storage
          .from(ATTACHMENT_BUCKET)
          .upload(path, bytes, { contentType: file.type || undefined, upsert: true });
        if (!upErr) {
          hasAttachment = true;
          await supabase.from("feedback").update({ attachment_path: path }).eq("id", inserted.id);
        }
      } catch {
        /* attachment is optional — ignore upload failures */
      }
    }

    await sendNotification(
      `New ${TYPE_LABEL[type]} submitted`,
      [
        `From: ${session.profile.full_name ?? session.profile.email ?? "a user"}`,
        `Type: ${TYPE_LABEL[type]}`,
        ...(subject ? [`Subject: ${subject}`] : []),
        ...(page ? [`Page: ${page}`] : []),
        "",
        message,
        ...(hasAttachment ? ["", "📎 An attachment was included — view it on the Feedback page."] : []),
      ],
      ["athirah@vertexmastery.com"], // feedback goes to Athirah only
    );
    revalidatePath("/feedback");
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Finance can mark a feedback item resolved. */
export async function resolveFeedback(fd: FormData): Promise<void> {
  const session = await requireSession();
  if (session.profile.role !== "finance") return;
  const id = (fd.get("id") as string | null)?.trim();
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("feedback").update({ resolved: true }).eq("id", id);
  revalidatePath("/feedback");
}
