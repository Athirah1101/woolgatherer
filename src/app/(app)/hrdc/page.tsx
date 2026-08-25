import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getHrdcRows } from "@/lib/data/hrdc";
import {
  AttentionBadge, ButtonLink, Card, Chip, EmptyState, PageHeader, StatusChip,
  SummaryCard, Table, TBody, TD, TH, THead, TR, cn,
} from "@/components/ui";
import { formatMYR, sumMoney } from "@/lib/finance/money";
import { formatDate } from "@/lib/finance/dates";
import { hrdcStageChip, refundColorTone } from "@/lib/finance/display";

const TABS = [
  { key: "all", label: "All Claims" },
  { key: "application", label: "Application" },
  { key: "training_upcoming", label: "Training Upcoming" },
  { key: "claim_to_submit", label: "Claim To Submit" },
  { key: "processing", label: "Processing" },
  { key: "refund_due", label: "Refund Due" },
  { key: "completed", label: "Completed" },
];

export default async function HrdcPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { profile } = await requireRole("finance", "management");
  const isFinance = profile.role === "finance";
  const sp = await searchParams;
  const tab = sp.tab ?? "all";
  const rows = await getHrdcRows();

  const refundAmountDue = sumMoney(rows.map((r) => r.refund.remaining));
  const refundsDue7 = rows.filter((r) => r.refundAttn && r.refundAttn.days >= 0 && r.refundAttn.days <= 7).length;
  const refundsOverdue = rows.filter((r) => r.refundAttn && r.refundAttn.days < 0).length;
  const fundsReceived = sumMoney(rows.map((r) => r.claim.hrdc_amount_received ?? 0));
  const amountProcessing = sumMoney(
    rows.filter((r) => r.tab === "processing").map((r) => r.claim.claim_amount ?? 0),
  );
  const trainingUpcoming = rows.filter((r) => r.tab === "training_upcoming").length;
  const toSubmit = rows.filter((r) => r.tab === "claim_to_submit").length;
  const queriesOpen = rows.filter((r) => r.query.open).length;

  const shown = tab === "all" ? rows : rows.filter((r) => r.tab === tab);

  return (
    <div>
      <PageHeader
        title="HRDC Claims"
        subtitle="Full claim lifecycle — grant, training, submission, processing, and the 30-day client refund."
        actions={isFinance ? <ButtonLink href="/hrdc/new">+ New HRDC Claim</ButtonLink> : undefined}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Refund Amount Due" value={formatMYR(refundAmountDue)} tone="orange" />
        <SummaryCard label="Refunds ≤ 7 Days" value={refundsDue7} tone="amber" />
        <SummaryCard label="Refunds Overdue" value={refundsOverdue} tone="red" />
        <SummaryCard label="HRDC Funds Received" value={formatMYR(fundsReceived)} tone="green" />
        <SummaryCard label="Amount Processing" value={formatMYR(amountProcessing)} tone="blue" />
        <SummaryCard label="Queries Open" value={queriesOpen} tone={queriesOpen ? "red" : "neutral"} />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const count =
            t.key === "all" ? rows.length : rows.filter((r) => r.tab === t.key).length;
          return (
            <Link
              key={t.key}
              href={`/hrdc?tab=${t.key}`}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition",
                tab === t.key ? "bg-brand text-white" : "border border-border bg-surface hover:bg-gray-50",
              )}
            >
              {t.label} <span className="opacity-70">({count})</span>
            </Link>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title="No HRDC claims currently require action."
          message={tab === "all" ? "Create a claim to begin tracking the lifecycle." : "Nothing in this stage right now."}
        />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <TR>
                <TH>Client</TH><TH>Product</TH><TH>Stage</TH>
                <TH right>HRDC Amount</TH><TH right>Refund Remaining</TH>
                <TH>Refund Countdown</TH><TH>Query</TH>
              </TR>
            </THead>
            <TBody>
              {shown.map((r) => {
                const stage = hrdcStageChip(r.stage);
                return (
                  <TR key={r.claim.id}>
                    <TD className="font-medium">
                      <Link href={`/hrdc/${r.claim.id}`} className="hover:text-brand hover:underline">
                        {r.claim.client_name}
                      </Link>
                    </TD>
                    <TD className="text-muted">{r.claim.product ?? "—"}</TD>
                    <TD><StatusChip label={stage.label} tone={stage.tone} /></TD>
                    <TD right>{r.claim.hrdc_amount_received != null ? formatMYR(r.claim.hrdc_amount_received) : "—"}</TD>
                    <TD right className="font-medium">
                      {r.refund.countdownActive ? formatMYR(r.refund.remaining) : "—"}
                    </TD>
                    <TD>
                      {r.refundAttn ? (
                        <AttentionBadge label={r.refundAttn.text} tone={refundColorTone(r.refundAttn.color)} />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TD>
                    <TD>
                      {r.query.open ? (
                        <AttentionBadge label={r.query.text ?? "Query"} tone={r.query.days != null && r.query.days < 0 ? "red" : "amber"} />
                      ) : r.claim.query_received ? (
                        <Chip tone="gray">Replied</Chip>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
