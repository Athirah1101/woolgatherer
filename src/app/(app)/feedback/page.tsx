import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, EmptyState, PageHeader } from "@/components/ui";
import { InlineSubmit } from "@/components/form";
import { formatDateTime } from "@/lib/finance/dates";
import { resolveFeedback } from "./actions";

interface FeedbackRow {
  id: string;
  message: string;
  page: string | null;
  resolved: boolean;
  created_at: string;
  submitted_by: string | null;
}

export default async function FeedbackPage() {
  const { profile } = await requireRole("finance", "management");
  const isFinance = profile.role === "finance";
  const supabase = await createClient();

  const [{ data: rows }, { data: profs }] = await Promise.all([
    supabase.from("feedback").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  const nameById = new Map(
    (profs ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [
      p.id,
      p.full_name || p.email || "—",
    ]),
  );
  const items = (rows ?? []) as FeedbackRow[];
  const open = items.filter((f) => !f.resolved);

  return (
    <div>
      <PageHeader
        title="Feedback"
        subtitle={`${open.length} open · from anyone using FinanceOS.`}
      />
      {items.length === 0 ? (
        <EmptyState title="No feedback yet." message="Feedback submitted via the “Send Feedback” button appears here." />
      ) : (
        <div className="space-y-3">
          {items.map((f) => (
            <Card key={f.id} className={f.resolved ? "opacity-60" : undefined}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-medium text-text">{f.submitted_by ? nameById.get(f.submitted_by) ?? "User" : "Anonymous"}</span>
                    <span>· {formatDateTime(f.created_at)}</span>
                    {f.page && <Chip tone="gray">{f.page}</Chip>}
                    {f.resolved && <Chip tone="green">Resolved</Chip>}
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{f.message}</p>
                </div>
                {isFinance && !f.resolved && (
                  <form action={resolveFeedback}>
                    <input type="hidden" name="id" value={f.id} />
                    <InlineSubmit variant="secondary">Mark resolved</InlineSubmit>
                  </form>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
