import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActivityInput {
  entity_type: string;
  entity_id: string | null;
  action: string;
  actor: string | null;
  summary?: string;
  old_value?: unknown;
  new_value?: unknown;
}

/** Best-effort activity log write; never throws into the caller. */
export async function logActivity(
  supabase: SupabaseClient,
  input: ActivityInput,
): Promise<void> {
  try {
    await supabase.from("activity_log").insert({
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      action: input.action,
      actor: input.actor,
      summary: input.summary ?? null,
      old_value: (input.old_value ?? null) as never,
      new_value: (input.new_value ?? null) as never,
    });
  } catch {
    // logging must not break the primary operation
  }
}
