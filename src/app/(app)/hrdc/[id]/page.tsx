import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getHrdcDetail } from "@/lib/data/hrdc";
import { getPaymentMethods, methodName } from "@/lib/data/refs";
import {
  AttentionBadge, Card, Chip, EmptyState, PageHeader, SectionTitle, StatusChip,
  SummaryCard, Table, TBody, TD, TH, THead, TR, cn,
} from "@/components/ui";
import { Field, FormDrawer, Input, MoneyInput, Select, Textarea } from "@/components/form";
import { formatMYR } from "@/lib/finance/money";
import { formatDate } from "@/lib/finance/dates";
import {
  claimSubmissionTarget, trainingWindow, trainingWindowWarning,
  HRDC_STAGES, HRDC_STAGE_LABEL,
} from "@/lib/finance/hrdc";
import { hrdcStageChip, refundColorTone, refundStatusChip } from "@/lib/finance/display";
import type { HrdcClaim } from "@/lib/types";
import { recordHrdcPayment, recordQuery, recordRefund, updateHrdcClaim } from "../actions";

function DL({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{value ?? "—"}</span>
    </div>
  );
}

export default async function HrdcDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await requireRole("finance", "management");
  const isFinance = profile.role === "finance";
  const row = await getHrdcDetail(id);
  if (!row) notFound();

  const { claim: c, refunds, refund, refundAttn, query, stage } = row;
  const methods = await getPaymentMethods();
  const win = trainingWindow(c.grant_approval_date);
  const winWarn = trainingWindowWarning(c);
  const submitTarget = claimSubmissionTarget(c.training_end_date);
  const stageChip = hrdcStageChip(stage);
  const stageIndex = HRDC_STAGES.indexOf(stage);
  const refundChip = refundStatusChip(refund.status);

  return (
    <div>
      <div className="mb-2">
        <Link href="/hrdc" className="text-sm text-muted hover:text-brand">← HRDC Claims</Link>
      </div>
      <PageHeader
        title={c.client_name}
        subtitle={[c.product, c.sales_pic ? `PIC: ${c.sales_pic}` : null].filter(Boolean).join(" · ") || undefined}
        actions={
          isFinance ? (
            <div className="flex flex-wrap gap-2">
              {!c.hrdc_received_date && <RecordHrdcPayment claim={c} />}
              {refund.countdownActive && <RecordRefund claim={c} methods={methods} remaining={refund.remaining} />}
              <LogQuery claim={c} />
              <EditClaim claim={c} />
            </div>
          ) : undefined
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Status:</span>
          <StatusChip label={stageChip.label} tone={stageChip.tone} />
        </div>
        {refundAttn && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Attention:</span>
            <AttentionBadge label={refundAttn.text} tone={refundColorTone(refundAttn.color)} />
          </div>
        )}
        {query.open && <AttentionBadge label={query.text ?? "Query open"} tone={query.days != null && query.days < 0 ? "red" : "amber"} />}
        {c.receivable_id && (
          <Link href={`/receivables/${c.receivable_id}`} className="ml-auto text-sm font-medium text-brand hover:underline">
            View linked receivable →
          </Link>
        )}
      </div>

      {/* Prominent refund countdown */}
      {refund.countdownActive && refundAttn && (
        <Card className={cn("mb-6 border-l-4", {
          green: "border-l-emerald-500",
          yellow: "border-l-amber-500",
          orange: "border-l-orange-500",
          red: "border-l-red-500",
        }[refundAttn.color])}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Client Refund Countdown</p>
              <p className="mt-1 text-2xl font-semibold">{refundAttn.text}</p>
              <p className="mt-1 text-sm text-muted">
                HRD funds received {formatDate(c.hrdc_received_date)} · deadline {formatDate(refund.deadline)} (received + 30 days)
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted">Remaining to refund</p>
              <p className="text-2xl font-semibold text-orange-600">{formatMYR(refund.remaining)}</p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Financial */}
        <div>
          <SectionTitle>Financial</SectionTitle>
          <Card>
            <DL label="Amount Client Paid" value={c.amount_client_paid != null ? formatMYR(c.amount_client_paid) : "—"} />
            <DL label="HRDC Claim Amount" value={c.claim_amount != null ? formatMYR(c.claim_amount) : "—"} />
            <DL label="Approved Amount" value={c.approved_amount != null ? formatMYR(c.approved_amount) : "—"} />
            <DL label="HRDC Amount Received" value={c.hrdc_amount_received != null ? formatMYR(c.hrdc_amount_received) : "—"} />
            <DL label="HRDC Received Date" value={formatDate(c.hrdc_received_date)} />
            <DL label="Refund Amount Due" value={refund.amountDue ? formatMYR(refund.amountDue) : "—"} />
            <DL label="Refunded" value={formatMYR(refund.refunded)} />
            <DL label="Refund Remaining" value={formatMYR(refund.remaining)} />
            <DL label="Refund Status" value={<Chip tone={refundChip.tone}>{refundChip.label}</Chip>} />
          </Card>

          <div className="mt-4">
            <SectionTitle>Refund History</SectionTitle>
            {refunds.length === 0 ? (
              <EmptyState title="No refunds recorded yet." message={refund.countdownActive ? "Record the client refund before the deadline." : "Refund starts once HRD funds are received."} />
            ) : (
              <Card padded={false}>
                <Table>
                  <THead><TR><TH>Date</TH><TH right>Amount</TH><TH>Method</TH><TH>Reference</TH></TR></THead>
                  <TBody>
                    {refunds.map((r) => (
                      <TR key={r.id}>
                        <TD>{formatDate(r.refund_date)}</TD>
                        <TD right className="font-medium">{formatMYR(r.amount)}</TD>
                        <TD>{methodName(methods, r.payment_method_id)}</TD>
                        <TD className="text-muted">{r.reference ?? "—"}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>
            )}
          </div>
        </div>

        {/* Lifecycle + deadlines */}
        <div>
          <SectionTitle>Grant & Training</SectionTitle>
          <Card>
            <DL label="Grant Application Date" value={formatDate(c.grant_application_date)} />
            <DL label="Grant Reference" value={c.grant_reference ?? "—"} />
            <DL label="Grant Approval Date" value={formatDate(c.grant_approval_date)} />
            <DL
              label="Permitted Training Window"
              value={win ? `${formatDate(win.earliest)} – ${formatDate(win.latest)}` : "Set grant approval date"}
            />
            <DL label="Training Start" value={formatDate(c.training_start_date)} />
            <DL label="Training End" value={formatDate(c.training_end_date)} />
            <DL label="Claim Submission Target" value={submitTarget ? `${formatDate(submitTarget)} (training + 7 days)` : "—"} />
            <DL label="Claim Submitted" value={formatDate(c.claim_submitted_date)} />
          </Card>
          {winWarn && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">⚠ {winWarn}</p>
          )}

          {(query.open || c.query_received) && (
            <div className="mt-4">
              <SectionTitle>Query</SectionTitle>
              <Card>
                <DL label="Query Received" value={formatDate(c.query_received_date)} />
                <DL label="Reply Deadline" value={query.deadline ? `${formatDate(query.deadline)} (received + 5 days)` : "—"} />
                <DL label="Replied" value={formatDate(c.query_replied_date)} />
                {c.query_details && <p className="pt-2 text-sm text-muted">{c.query_details}</p>}
              </Card>
            </div>
          )}

          <div className="mt-4">
            <SectionTitle>Lifecycle</SectionTitle>
            <Card>
              <ol className="space-y-1.5">
                {HRDC_STAGES.map((st, i) => (
                  <li key={st} className="flex items-center gap-2 text-sm">
                    <span className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-xs",
                      i < stageIndex ? "bg-emerald-100 text-emerald-700" :
                      i === stageIndex ? "bg-brand text-white" : "bg-gray-100 text-gray-400",
                    )}>
                      {i < stageIndex ? "✓" : i + 1}
                    </span>
                    <span className={cn(i === stageIndex && "font-semibold", i > stageIndex && "text-muted")}>
                      {HRDC_STAGE_LABEL[st]}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- action forms
function RecordHrdcPayment({ claim }: { claim: HrdcClaim }) {
  return (
    <FormDrawer
      triggerLabel="Record HRDC Payment"
      title="Record HRD Corp Payment"
      description="Starts the 30-day client refund countdown from the date funds are received."
      action={recordHrdcPayment}
      submitLabel="Record Payment"
    >
      <input type="hidden" name="id" value={claim.id} />
      <Field label="Amount Received" required><MoneyInput name="hrdc_amount_received" defaultValue={claim.claim_amount ?? undefined} required /></Field>
      <Field label="Date Received" required hint="The 30-day refund deadline counts from this exact date."><Input type="date" name="hrdc_received_date" required /></Field>
      <Field label="Refund Amount Due To Client" hint="Defaults to the amount received."><MoneyInput name="refund_amount_due" defaultValue={claim.claim_amount ?? undefined} /></Field>
    </FormDrawer>
  );
}

function RecordRefund({ claim, methods, remaining }: { claim: HrdcClaim; methods: { id: string; name: string }[]; remaining: number }) {
  return (
    <FormDrawer
      triggerLabel="Record Refund"
      title="Record Client Refund"
      description={`${formatMYR(remaining)} remaining. Partial refunds are supported.`}
      action={recordRefund}
      submitLabel="Record Refund"
    >
      <input type="hidden" name="claim_id" value={claim.id} />
      <Field label="Refund Amount" required><MoneyInput name="amount" defaultValue={remaining} required /></Field>
      <Field label="Refund Date" required><Input type="date" name="refund_date" required /></Field>
      <Field label="Payment Method">
        <Select name="payment_method_id" defaultValue={claim.refund_payment_method_id ?? ""}>
          <option value="">—</option>
          {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </Field>
      <Field label="Reference"><Input name="reference" /></Field>
      <Field label="Notes"><Textarea name="notes" /></Field>
    </FormDrawer>
  );
}

function LogQuery({ claim }: { claim: HrdcClaim }) {
  return (
    <FormDrawer
      triggerLabel="Log Query"
      triggerVariant="secondary"
      title="Log HRD Corp Query"
      description="Reply deadline auto-calculates as 5 calendar days from the received date."
      action={recordQuery}
      submitLabel="Save Query"
    >
      <input type="hidden" name="id" value={claim.id} />
      <Field label="Query Received Date" required><Input type="date" name="query_received_date" defaultValue={claim.query_received_date ?? ""} required /></Field>
      <Field label="Query Details"><Textarea name="query_details" defaultValue={claim.query_details ?? ""} /></Field>
      <Field label="Replied Date (if replied)"><Input type="date" name="query_replied_date" defaultValue={claim.query_replied_date ?? ""} /></Field>
    </FormDrawer>
  );
}

function EditClaim({ claim: c }: { claim: HrdcClaim }) {
  return (
    <FormDrawer
      triggerLabel="Edit Claim"
      triggerVariant="secondary"
      title="Edit HRDC Claim"
      action={updateHrdcClaim}
      submitLabel="Save Claim"
      width="max-w-xl"
    >
      <input type="hidden" name="id" value={c.id} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client" required><Input name="client_name" defaultValue={c.client_name} required /></Field>
        <Field label="Contact"><Input name="contact_name" defaultValue={c.contact_name ?? ""} /></Field>
        <Field label="Product"><Input name="product" defaultValue={c.product ?? ""} /></Field>
        <Field label="Sales PIC"><Input name="sales_pic" defaultValue={c.sales_pic ?? ""} /></Field>
        <Field label="Amount Client Paid"><MoneyInput name="amount_client_paid" defaultValue={c.amount_client_paid ?? undefined} /></Field>
        <Field label="Claim Amount"><MoneyInput name="claim_amount" defaultValue={c.claim_amount ?? undefined} /></Field>
        <Field label="Approved Amount"><MoneyInput name="approved_amount" defaultValue={c.approved_amount ?? undefined} /></Field>
        <Field label="Grant Reference"><Input name="grant_reference" defaultValue={c.grant_reference ?? ""} /></Field>
        <Field label="Grant Application Date"><Input type="date" name="grant_application_date" defaultValue={c.grant_application_date ?? ""} /></Field>
        <Field label="Grant Approval Date"><Input type="date" name="grant_approval_date" defaultValue={c.grant_approval_date ?? ""} /></Field>
        <Field label="Grant Status"><Input name="grant_status" defaultValue={c.grant_status ?? ""} /></Field>
        <Field label="Training Start"><Input type="date" name="training_start_date" defaultValue={c.training_start_date ?? ""} /></Field>
        <Field label="Training End"><Input type="date" name="training_end_date" defaultValue={c.training_end_date ?? ""} /></Field>
        <Field label="Documents Collected"><Input type="date" name="documents_collected_date" defaultValue={c.documents_collected_date ?? ""} /></Field>
        <Field label="Claim Submitted"><Input type="date" name="claim_submitted_date" defaultValue={c.claim_submitted_date ?? ""} /></Field>
        <Field label="Claim Approved"><Input type="date" name="claim_approved_date" defaultValue={c.claim_approved_date ?? ""} /></Field>
        <Field label="Claim Status"><Input name="claim_status" defaultValue={c.claim_status ?? ""} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="documents_complete" defaultChecked={c.documents_complete} className="h-4 w-4" /> Documents complete
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="grant_approval_notification_sent" defaultChecked={c.grant_approval_notification_sent} className="h-4 w-4" /> Grant approval notification sent to client
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="refund_processing_notification_sent" defaultChecked={c.refund_processing_notification_sent} className="h-4 w-4" /> Refund processing notification sent to client
      </label>
      <Field label="Notes"><Textarea name="notes" defaultValue={c.notes ?? ""} /></Field>
    </FormDrawer>
  );
}
