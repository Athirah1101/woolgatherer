import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, Chip, EmptyState, PageHeader } from "@/components/ui";
import { InlineSubmit } from "@/components/form";
import { formatDateTime } from "@/lib/finance/dates";
import { TableSearch } from "@/components/TableSearch";
import { resolveFeedback, unresolveFeedback } from "./actions";

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

/** One feedback card, used in both the open list and the resolved archive. */
function FeedbackCard({
  f,
  submitter,
  attachmentUrl,
  isFinance,
}: {
  f: FeedbackRow;
  submitter: string;
  attachmentUrl: string | undefined;
  isFinance: boolean;
}) {
  const meta = TYPE_META[f.type ?? "note"] ?? TYPE_META.note;
  return (
    <div data-search={`${f.subject ?? ""} ${f.message} ${submitter} ${meta.label}`.toLowerCase()}>
      <Card className={f.resolved ? "opacity-70" : undefined}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <Chip tone={meta.tone}>{meta.label}</Chip>
              <span className="font-medium text-text">{submitter || "Anonymous"}</span>
              <span>· {formatDateTime(f.created_at)}</span>
              {f.page && <Chip tone="gray">{f.page}</Chip>}
              {f.resolved && <Chip tone="green">✓ Resolved</Chip>}
            </div>
            {f.subject && <p className="mb-0.5 text-sm font-semibold">{f.subject}</p>}
            <p className="whitespace-pre-wrap text-sm">{f.message}</p>
            {f.attachment_path &&
              (attachmentUrl ? (
                <a
                  href={attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                >
                  📎 View attachment
                </a>
              ) : (
                <p className="mt-2 text-xs text-muted">📎 Attachment (couldn’t load link)</p>
              ))}
          </div>
          {isFinance && (
            <form action={f.resolved ? unresolveFeedback : resolveFeedback}>
              <input type="hidden" name="id" value={f.id} />
              <InlineSubmit variant="secondary">
                {f.resolved ? "Reopen" : "Mark resolved"}
              </InlineSubmit>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { profile } = await requireRole("finance", "management");
  const isFinance = profile.role === "finance";
  await searchParams;
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
  const resolved = items.filter((f) => f.resolved);

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

  const submitterOf = (f: FeedbackRow) =>
    f.submitted_by ? nameById.get(f.submitted_by) ?? "User" : "";

  return (
    <div>
      <PageHeader
        title="Feedback"
        subtitle={`${open.length} open · ${resolved.length} resolved · from anyone using FinanceOS.`}
        actions={
          items.length > 0 ? (
            <TableSearch targetId="feedback-list" placeholder="Search feedback…" className="w-56" />
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="No feedback yet."
          message="Feedback submitted via the “Send Feedback” button appears here."
        />
      ) : (
        <div id="feedback-list">
          {/* Open items */}
          {open.length === 0 ? (
            <Card className="border-emerald-200 bg-emerald-50/60">
              <p className="text-sm font-medium text-emerald-800">🎉 All caught up — no open feedback.</p>
              <p className="mt-0.5 text-sm text-emerald-700/80">
                Resolved items are tucked into the archive below.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {open.map((f) => (
                <FeedbackCard
                  key={f.id}
                  f={f}
                  submitter={submitterOf(f)}
                  attachmentUrl={attachmentUrls.get(f.id)}
                  isFinance={isFinance}
                />
              ))}
            </div>
          )}

          {/* Search "no matches" state (covers both open + archive) */}
          <div id="feedback-list-empty" hidden>
            <EmptyState title="No matching feedback." message="No feedback matches your search." />
          </div>

          {/* Resolved archive — collapsible, closed by default */}
          {resolved.length > 0 && (
            <details className="group mt-6 rounded-xl border border-border bg-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3.5 text-sm font-medium text-muted transition hover:bg-gray-50">
                <span className="flex items-center gap-2">
                  🗂 Resolved archive
                  <Chip tone="green">{resolved.length}</Chip>
                </span>
                <span className="text-xs text-muted transition group-open:rotate-180">▼</span>
              </summary>
              <div className="space-y-3 border-t border-border p-4">
                {resolved.map((f) => (
                  <FeedbackCard
                    key={f.id}
                    f={f}
                    submitter={submitterOf(f)}
                    attachmentUrl={attachmentUrls.get(f.id)}
                    isFinance={isFinance}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
