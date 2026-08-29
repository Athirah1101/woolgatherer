import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getHrdcRows } from "@/lib/data/hrdc";
import { getPaymentMethods } from "@/lib/data/refs";
import {
  AttentionBadge, Card, Chip, EmptyState, PageHeader, SectionTitle, StatusChip,
  SummaryCard, Table, TBody, TD, TH, THead, TR, cn,
} from "@/components/ui";
import { formatMYR, sumMoney } from "@/lib/finance/money";
import { formatDate } from "@/lib/finance/dates";
import { refundStatusChip, refundColorTone } from "@/lib/finance/display";
import { SearchBox } from "@/components/SearchBox";
import { SinceTimer } from "./SinceTimer";
import { RefundCaseForm, RecordRefundForm } from "./RefundForms";
import { REFUND_TYPES, refundTypeLabel } from "./refundTypes";

export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { profile } = await requireRole("finance", "management");
  const isFinance = profile.role === "finance";
  const sp = await searchParams;

  const [rows, methods] = await Promise.all([getHrdcRows(), getPaymentMethods()]);

  // A refund case = any record with a refund owed (any type) or HRD funds received.
  const allCases = rows.filter(
    (r) => r.claim.hrdc_received_date || (r.claim.refund_amount_due ?? 0) > 0,
  );

  const typeFilter = REFUND_TYPES.some((t) => t.value === sp.type) ? sp.type : "all";
  const typeFiltered = typeFilter === "all" ? allCases : allCases.filter((r) => r.claim.refund_type === typeFilter);
  const q = (sp.q ?? "").trim().toLowerCase();
  const cases = q
    ? typeFiltered.filter(
        (r) =>
          r.claim.client_name?.toLowerCase().includes(q) ||
          refundTypeLabel(r.claim.refund_type).toLowerCase().includes(q) ||
          (r.claim.notes ?? "").toLowerCase().includes(q),
      )
    : typeFiltered;

  // Active = HRDC funds received but not yet fully refunded — these get a live timer.
  const active = cases.filter((r) => r.claim.hrdc_received_date && r.refund.remaining > 0);

  const totalRemaining = sumMoney(cases.map((r) => r.refund.remaining));
  const totalRefunded = sumMoney(cases.map((r) => r.refund.refunded));
  const overdue = cases.filter((r) => r.refundAttn && r.refundAttn.days < 0).length;
  const due7 = cases.filter((r) => r.refundAttn && r.refundAttn.days >= 0 && r.refundAttn.days <= 7).length;

  return (
    <div>
      <PageHeader
        title="Refunds"
        subtitle="Money owed back to clients — HRDC, deposits, changed-mind and more. HRDC refunds carry the 30-day clock."
        actions={
          isFinance ? (
            <RefundCaseForm trigger="+ New Refund Case" />
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
        {[{ value: "all", label: "All" }, ...REFUND_TYPES].map((t) => {
          const count =
            t.value === "all" ? allCases.length : allCases.filter((r) => r.claim.refund_type === t.value).length;
          return (
            <Link
              key={t.value}
              href={t.value === "all" ? "/refunds" : `/refunds?type=${t.value}`}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition",
                typeFilter === t.value ? "bg-brand text-white" : "border border-border bg-surface hover:bg-gray-50",
              )}
            >
              {t.label} <span className="opacity-70">({count})</span>
            </Link>
          );
        })}
        </div>
        <SearchBox placeholder="Search client, type or notes…" className="w-56" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Refund Remaining" value={formatMYR(totalRemaining)} tone="orange" />
        <SummaryCard label="Refunds Overdue" value={overdue} tone={overdue ? "red" : "neutral"} />
        <SummaryCard label="Due ≤ 7 Days" value={due7} tone={due7 ? "amber" : "neutral"} />
        <SummaryCard label="Total Refunded" value={formatMYR(totalRefunded)} tone="green" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main table */}
        <div className="lg:col-span-2">
          {cases.length === 0 ? (
            <EmptyState
              title="No refund cases here."
              message={
                isFinance
                  ? "Add a refund case for any money owed back to a client — HRDC, a refundable deposit, a changed-mind refund, and more."
                  : "Refund cases appear here once one is logged."
              }
            />
          ) : (
            <Card padded={false}>
              <Table>
                <THead>
                  <TR>
                    <TH>Client</TH>
                    <TH>Type</TH>
                    <TH right>Paid</TH>
                    <TH right>Claimed</TH>
                    <TH>HRDF Received</TH>
                    <TH right>Refund Due</TH>
                    <TH right>Remaining</TH>
                    <TH>Deadline</TH>
                    <TH>Status</TH>
                    {isFinance && <TH>Actions</TH>}
                  </TR>
                </THead>
                <TBody>
                  {cases.map((r) => {
                    const st = refundStatusChip(r.refund.status);
                    return (
                      <TR key={r.claim.id}>
                        <TD className="font-medium">{r.claim.client_name}</TD>
                        <TD><Chip tone={r.claim.refund_type === "hrdc" ? "indigo" : "gray"}>{refundTypeLabel(r.claim.refund_type)}</Chip></TD>
                        <TD right>{r.claim.amount_client_paid != null ? formatMYR(r.claim.amount_client_paid) : "—"}</TD>
                        <TD right>{r.claim.claim_amount != null ? formatMYR(r.claim.claim_amount) : "—"}</TD>
                        <TD className="text-muted">{formatDate(r.claim.hrdc_received_date)}</TD>
                        <TD right>{formatMYR(r.refund.amountDue)}</TD>
                        <TD right className="font-medium">{formatMYR(r.refund.remaining)}</TD>
                        <TD>
                          {r.refundAttn ? (
                            <AttentionBadge label={r.refundAttn.text} tone={refundColorTone(r.refundAttn.color)} />
                          ) : (
                            <span className="text-muted">{formatDate(r.refund.deadline)}</span>
                          )}
                        </TD>
                        <TD><StatusChip label={st.label} tone={st.tone} /></TD>
                        {isFinance && (
                          <TD>
                            <div className="flex flex-wrap gap-1.5">
                              {r.refund.remaining > 0 && (
                                <RecordRefundForm claimId={r.claim.id} methods={methods} trigger="Record" />
                              )}
                              <RefundCaseForm
                                trigger="Edit"
                                defaults={{
                                  id: r.claim.id,
                                  client_name: r.claim.client_name,
                                  notes: r.claim.notes,
                                  refund_type: r.claim.refund_type,
                                  amount_client_paid: r.claim.amount_client_paid,
                                  claim_amount: r.claim.claim_amount,
                                  hrdc_received_date: r.claim.hrdc_received_date,
                                  hrdc_amount_received: r.claim.hrdc_amount_received,
                                  refund_amount_due: r.claim.refund_amount_due,
                                }}
                              />
                            </div>
                          </TD>
                        )}
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          )}
        </div>

        {/* Side panel: live count-up timers since HRD funds received */}
        <div>
          <SectionTitle>Time Since HRDF Received</SectionTitle>
          {active.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">
                No active refunds. Timers appear here the moment HRD Corp funds are received.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {active.map((r) => {
                const attn = r.refundAttn;
                return (
                  <Card
                    key={r.claim.id}
                    className={cn(
                      "border-l-4",
                      attn?.color === "red" && "border-l-red-500",
                      attn?.color === "orange" && "border-l-orange-500",
                      attn?.color === "yellow" && "border-l-amber-400",
                      attn?.color === "green" && "border-l-emerald-500",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{r.claim.client_name}</span>
                      <span className="text-sm text-muted">{formatMYR(r.refund.remaining)}</span>
                    </div>
                    <div className="mt-2 text-lg">
                      <SinceTimer since={r.claim.hrdc_received_date!} />
                    </div>
                    {attn && (
                      <div className="mt-2">
                        <AttentionBadge label={attn.text} tone={refundColorTone(attn.color)} />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
