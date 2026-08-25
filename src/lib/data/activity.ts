import { createClient } from "@/lib/supabase/server";

export interface ActivityRow {
  id: string;
  entityType: string;
  action: string;
  summary: string | null;
  createdAt: string;
  actorName: string;
}

/** Recent change history, newest first, with the acting user's name resolved. */
export async function getActivity(limit = 200): Promise<ActivityRow[]> {
  const supabase = await createClient();
  const [{ data: logs }, { data: profs }] = await Promise.all([
    supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(limit),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  const nameById = new Map(
    (profs ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [
      p.id,
      p.full_name || p.email || "—",
    ]),
  );
  return (logs ?? []).map((l: {
    id: string; entity_type: string; action: string; summary: string | null;
    created_at: string; actor: string | null;
  }) => ({
    id: l.id,
    entityType: l.entity_type,
    action: l.action,
    summary: l.summary,
    createdAt: l.created_at,
    actorName: l.actor ? (nameById.get(l.actor) ?? "Unknown user") : "System / automatic",
  }));
}
