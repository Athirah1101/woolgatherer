import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, Chip, EmptyState, PageHeader } from "@/components/ui";
import { InlineSubmit } from "@/components/form";
import { formatDateTime } from "@/lib/finance/dates";
import { SearchBox } from "@/components/SearchBox";
import { resolveFeedback } from "./actions";

interface FeedbackRow {
  id: string;
  message: string;
  page: string | null;
  resolved: boolean;
  created_at: string;
  submitted_by: string | null;
  type: string | null;
  subject: string | null;
  attachment_path: string | null;
}

const TYPE_META: Record<string, { label: string; tone: "red" | "amber" | "blue" }> = {
  bug: { label: "🐞 Bug", tone: "red" },
  suggestion: { label: "💡 Suggestion", tone: "amber" },
  note: { label: "💬 Note", tone: "blue" },
};

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { profile } = await requireRole("finance", "management");
  const isFinance = profile.role === "finance";
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
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
  const shown = q
    ? items.filter((f) => {
        const submitter = f.submitted_by ? nameById.get(f.submitted_by) ?? "" : "";
        return (
          f.message.toLowerCase().includes(q) ||
          (f.subject ?? "").toLowerCase().includes(q) ||
          submitter.toLowerCase().includes(q)
        );
      })
    : items;

  // Signed, short-lived URLs for any attachments (private bucket).
  const attachmentUrls = new Map<string, string>();
  const withFiles = items.filter((f) => f.attachment_path);
  if (withFiles.length) {
    try {
      const admin = createAdminClient();
      await Promise.all(
        withFiles.map(async (f) => {
          const { data } = await admin.storage
            .from("feedback-attachments")
            .createSignedUrl(f.attachment_path!, 3600);
          if (data?.signedUrl) attachmentUrls.set(f.id, data.signedUrl);
        }),
      );
    } catch {
      /* attachments are best-effort to display */
    }
  }

  return (
    <div>
      <PageHeader
        title="Feedback"
        subtitle={`${open.length} open · from anyone using FinanceOS.`}
        actions={<SearchBox placeholder="Search feedback…" className="w-56" />}
      />
      {shown.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? "No feedback yet." : "No matching feedback."}
          message={
            items.length === 0
              ? "Feedback submitted via the “Send Feedback” button appears here."
              : "No feedback matches your search."
          }
        />
      ) : (
        <div className="space-y-3">
          {shown.map((f) => (
            <Card key={f.id} className={f.resolved ? "opacity-60" : undefined}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {(() => {
                      const meta = TYPE_META[f.type ?? "note"] ?? TYPE_META.note;
                      return <Chip tone={meta.tone}>{meta.label}</Chip>;
                    })()}
                    <span className="font-medium text-text">{f.submitted_by ? nameById.get(f.submitted_by) ?? "User" : "Anonymous"}</span>
                    <span>· {formatDateTime(f.created_at)}</span>
                    {f.page && <Chip tone="gray">{f.page}</Chip>}
                    {f.resolved && <Chip tone="green">Resolved</Chip>}
                  </div>
                  {f.subject && <p className="mb-0.5 text-sm font-semibold">{f.subject}</p>}
                  <p className="whitespace-pre-wrap text-sm">{f.message}</p>
                  {f.attachment_path && (
                    attachmentUrls.has(f.id) ? (
                      <a
                        href={attachmentUrls.get(f.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                      >
                        📎 View attachment
                      </a>
                    ) : (
                      <p className="mt-2 text-xs text-muted">📎 Attachment (couldn’t load link)</p>
                    )
                  )}
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
