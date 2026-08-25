"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import type { ActionState } from "@/components/form";
import { sendNotification } from "@/lib/integrations/email";

/** Anyone signed in can submit feedback. Stored in-app + emailed to the team. */
export async function submitFeedback(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const session = await requireSession();
    const message = (fd.get("message") as string | null)?.trim() ?? "";
    const page = (fd.get("page") as string | null)?.trim() || null;
    if (!message) return { error: "Please write your feedback first." };

    const supabase = await createClient();
    const { error } = await supabase.from("feedback").insert({
      message,
      page,
      submitted_by: session.userId,
    });
    if (error) return { error: error.message };

    await sendNotification("New feedback submitted", [
      `From: ${session.profile.full_name ?? session.profile.email ?? "a user"}`,
      ...(page ? [`Page: ${page}`] : []),
      message,
    ]);
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
