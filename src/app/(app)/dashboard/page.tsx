import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getDashboardData } from "@/lib/data/dashboard";
import { Card, EmptyState, PageHeader, SectionTitle, SummaryCard, cn } from "@/components/ui";
import { formatMYR } from "@/lib/finance/money";
import type { AttentionSeverity } from "@/lib/finance/attention";

const SEV_DOT: Record<AttentionSeverity, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-sky-500",
};
const SEV_LABEL: Record<AttentionSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export default async function DashboardPage() {
  const { profile } = await requireSession();
  const d = await getDashboardData();
  const isSales = profile.role === "sales";
  const canSeeInternal = profile.role === "finance" || profile.role === "management";

  return (
    <div>
      <PageHeader
        title={`Good day, ${(profile.full_name ?? "there").split(" ")[0]}`}
        subtitle={isSales ? "Your receivables that need collection." : "What requires Finance's attention today."}
      />

      {/* Attention Required — the operational heart */}
      <div className="mb-8">
        <SectionTitle>Attention Required</SectionTitle>
        {d.attention.length === 0 ? (
          <EmptyState title="Nothing needs attention right now." message="No overdue items, due payments, or refund deadlines." />
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-border">
              {d.attention.map((a) => (
                <li key={a.id}>
                  <Link href={a.href} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", SEV_DOT[a.severity])} />
                    <span className="flex-1 text-sm font-medium">{a.title}</span>
                    <span className="text-xs uppercase tracking-wide text-muted">{SEV_LABEL[a.severity]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* Sales: collection view only */}
      {isSales && (
        <div className="mb-8">
          <SectionTitle>Your Collection</SectionTitle>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <SummaryCard label="Outstanding" value={formatMYR(d.recv.outstanding)} tone="amber" href="/receivables?quick=outstanding" />
            <SummaryCard label="Overdue" value={formatMYR(d.recv.overdue)} tone="red" href="/receivables?quick=overdue" />
            <SummaryCard label="Due This Week" value={formatMYR(d.recv.dueThisWeek)} tone="blue" href="/receivables?quick=due_week" />
          </div>
        </div>
      )}

      {canSeeInternal && (
        <>
          <div className="mb-8">
            <SectionTitle>Cash</SectionTitle>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <SummaryCard label="Current Cash" value={formatMYR(d.currentCash)} tone="green" href="/settings/bank-accounts" />
              <SummaryCard label="Projected Month-End Cash" value={formatMYR(d.projectedMonthEnd)}
                tone={d.projectedMonthEnd >= d.currentCash ? "green" : "red"} href="/cashflow" />
            </div>
          </div>

          <div className="mb-8">
            <SectionTitle>Receivables</SectionTitle>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <SummaryCard label="Outstanding" value={formatMYR(d.recv.outstanding)} tone="amber" href="/receivables?quick=outstanding" />
              <SummaryCard label="Overdue" value={formatMYR(d.recv.overdue)} tone="red" href="/receivables?quick=overdue" />
              <SummaryCard label="Due This Week" value={formatMYR(d.recv.dueThisWeek)} tone="blue" href="/receivables?quick=due_week" />
              <SummaryCard label="Due This Month" value={formatMYR(d.recv.dueThisMonth)} href="/receivables?quick=due_month" />
            </div>
          </div>

          <div className="mb-8">
            <SectionTitle>Payables</SectionTitle>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <SummaryCard label="Overdue" value={formatMYR(d.pay.overdue)} tone="red" href="/payables" />
              <SummaryCard label="Due Today" value={formatMYR(d.pay.dueToday)} tone="orange" href="/payables" />
              <SummaryCard label="Due Within 3 Days" value={formatMYR(d.pay.due3)} tone="amber" href="/payables" />
              <SummaryCard label="Due Within 7 Days" value={formatMYR(d.pay.due7)} tone="blue" href="/payables" />
            </div>
          </div>

          <div className="mb-8">
            <SectionTitle>HRDC</SectionTitle>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              <SummaryCard label="Claims To Submit" value={d.hrdc.toSubmit} tone="amber" href="/hrdc?tab=claim_to_submit" />
              <SummaryCard label="Processing" value={d.hrdc.processing} tone="blue" href="/hrdc?tab=processing" />
              <SummaryCard label="Funds Received" value={formatMYR(d.hrdc.fundsReceived)} tone="green" href="/hrdc" />
              <SummaryCard label="Refund Due" value={formatMYR(d.hrdc.refundDue)} tone="orange" href="/hrdc?tab=refund_due" />
              <SummaryCard label="Refunds ≤ 7 Days" value={d.hrdc.refundsDue7} tone="amber" href="/hrdc?tab=refund_due" />
              <SummaryCard label="Overdue Refunds" value={d.hrdc.refundsOverdue} tone="red" href="/hrdc?tab=refund_due" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
