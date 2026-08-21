import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

export interface Session {
  userId: string;
  profile: Profile;
}

/**
 * Current session + profile, or null if not authenticated.
 *
 * Wrapped in React `cache()` so it runs at most ONCE per server request even
 * though the layout, the page, and any server action each ask for it — this
 * removes several redundant round-trips to Supabase (auth + profile) on every
 * navigation, which is the main source of the app feeling slow.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile) return null;
  return { userId: user.id, profile: profile as Profile };
});

/** Require a signed-in user; redirect to /login otherwise. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Require one of the given roles; redirect to /dashboard otherwise. */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const session = await requireSession();
  if (!roles.includes(session.profile.role)) redirect("/dashboard");
  return session;
}

export function isFinance(p: Profile): boolean {
  return p.role === "finance";
}
export function canSeeInternalFinance(p: Profile): boolean {
  return p.role === "finance" || p.role === "management";
}
