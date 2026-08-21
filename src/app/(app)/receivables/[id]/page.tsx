import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getReceivableDetail } from "@/lib/data/receivables";
import { getPaymentMethods, methodName } from "@/lib/data/refs";
import {
  AttentionBadge, ButtonLink, Card, Chip, EmptyState, PageHeader, SectionTitle,
  StatusChip, SummaryCard, Table, TBody, TD, TH, THead, TR,
} from "@/components/ui";
import {
  Field, FormDrawer, InlineSubmit, Input, MoneyInput, Select, Textarea,
} from "@/components/form";
import { formatMYR } from "@/lib/finance/money";
import { formatDate, todayISO } from "@/lib/finance/dates";
import {
  collectionStatusChip, receivableAttention, scheduleStatusChip,
} from "@/lib/finance/display";
import { hrdcStageChip } from "@/lib/finance/display";
import type { HrdcStage } from "@/lib/finance/hrdc";
import {
  deleteScheduleRow, recordPayment, saveScheduleRow, updateReceivable, voidPayment,
} from "../actions";

export default async function ReceivableDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireSession();
  const detail = await getReceivableDetail(id);
  if (!detail) notFound();

  const { receivable: r, schedules, payments, allocations, summary, hrdcClaim } = detail;
  const methods = await getPaymentMethods();
  const isFinance = profile.role === "finance";
  const today = todayISO();
  const attn = receivableAttention(summary, today);
  const status = collectionStatusChip(summary.collectionStatus);
  const openSchedules = summary.schedules.filter((s) => s.outstanding > 0);

  // allocation lookup for payment history
  const allocByPayment = new Map<string, number>();
  for (const a of allocations)
    allocByPayment.set(a.payment_id, (allocByPayment.get(a.payment_id) ?? 0) + a.amount);

  return (
    <div>
      <div className="mb-2">
        <Link href="/receivables" className="text-sm text-muted hover:text-brand">← Receivables</Link>
      </div>
      <PageHeader
        title={r.client_name}
        subtitle={[r.product, r.sales_pic ? `PIC: ${r.sales_pic}` : null].filter(Boolean).join(" · ") || undefined}
        actions={
          isFinance ? (
            <div className="flex gap-2">
              <RecordPayment receivableId={r.id} methods={methods} openSchedules={openSchedules} />
              <EditReceivable r={r} />
            </div>
          ) : undefined
        }
      />

      {/* Collection summary */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard label="Deal Amount" value={formatMYR(r.total_receivable)} />
        <SummaryCard label="Total Paid" value={formatMYR(summary.totalPaid)} tone="green" />
        <SummaryCard label="Outstanding" value={formatMYR(summary.outstanding)} tone="amber" />
        <SummaryCard
          label="Overdue"
          value={formatMYR(summary.overdueAmount)}
          tone={summary.overdueAmount > 0 ? "red" : "neutral"}
          sub={summary.overdueAmount > 0 ? `${summary.daysOverdue} days overdue` : undefined}
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Status:</span>
          <StatusChip label={status.label} tone={status.tone} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Attention:</span>
          <AttentionBadge label={attn.label} tone={attn.tone} />
        </div>
        {summary.credit > 0 && (
          <Chip tone="blue">Unapplied credit: {formatMYR(summary.credit)}</Chip>
        )}
        {r.hrdc_applicable && (
          <span className="ml-auto">
            {hrdcClaim ? (
              <ButtonLink href={`/hrdc/${hrdcClaim.id}`} variant="secondary">
                HRDC Claim Active — {hrdcStageChip(hrdcClaim.stage as HrdcStage).label}
              </ButtonLink>
            ) : isFinance ? (
              <ButtonLink href={`/hrdc/new?receivable=${r.id}`} variant="secondary">
                + Create HRDC Claim
              </ButtonLink>
            ) : (
              <Chip tone="indigo">HRDC Applicable</Chip>
            )}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Payment schedule */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <SectionTitle>Payment Schedule</SectionTitle>
            {isFinance && <ScheduleRow receivableId={r.id} />}
          </div>
          {summary.schedules.length === 0 ? (
            <EmptyState title="No instalments scheduled." message="Add instalments so collection can be tracked." />
          ) : (
            <Card padded={false}>
              <Table>
                <THead>
                  <TR>
                    <TH>Due Date</TH>
                    <TH right>Expected</TH>
                    <TH right>Paid</TH>
                    <TH right>Outstanding</TH>
                    <TH>Status</TH>
                    {isFinance && <TH right></TH>}
                  </TR>
                </THead>
                <TBody>
                  {summary.schedules.map((s) => {
                    const chip = scheduleStatusChip(s.status);
                    const row = schedules.find((x) => x.id === s.id)!;
                    return (
                      <TR key={s.id}>
                        <TD>{formatDate(s.due_date)}</TD>
                        <TD right>{formatMYR(s.expected)}</TD>
                        <TD right className="text-emerald-700">{formatMYR(s.allocated)}</TD>
                        <TD right className="font-medium">{formatMYR(s.outstanding)}</TD>
                        <TD><StatusChip label={chip.label} tone={chip.tone} /></TD>
                        {isFinance && (
                          <TD right>
                            <div className="flex justify-end gap-1">
                              <ScheduleRow receivableId={r.id} row={row} />
                              {s.allocated === 0 && (
                                <form action={deleteScheduleRow}>
                                  <input type="hidden" name="id" value={s.id} />
                                  <input type="hidden" name="receivable_id" value={r.id} />
                                  <InlineSubmit variant="danger" confirm="Remove this instalment?">Delete</InlineSubmit>
                                </form>
                              )}
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

        {/* Payment history */}
        <div>
          <SectionTitle>Payment History</SectionTitle>
          {payments.filter((p) => !p.voided).length === 0 ? (
            <EmptyState title="No payments recorded yet." message="Use Record Payment when money comes in." />
          ) : (
            <Card padded={false}>
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH right>Amount</TH>
                    <TH>Method</TH>
                    <TH>Reference</TH>
                    {isFinance && <TH right></TH>}
                  </TR>
                </THead>
                <TBody>
                  {payments.map((p) => (
                    <TR key={p.id} className={p.voided ? "opacity-40" : undefined}>
                      <TD>{formatDate(p.received_date)}</TD>
                      <TD right className="font-medium">{formatMYR(p.amount)}</TD>
                      <TD>{methodName(methods, p.payment_method_id)}</TD>
                      <TD className="text-muted">{p.reference ?? "—"}</TD>
                      {isFinance && (
                        <TD right>
                          {!p.voided && (
                            <form action={voidPayment}>
                              <input type="hidden" name="id" value={p.id} />
                              <input type="hidden" name="receivable_id" value={r.id} />
                              <InlineSubmit variant="danger" confirm="Void this payment? It will be excluded from all totals.">Void</InlineSubmit>
                            </form>
                          )}
                          {p.voided && <span className="text-xs text-muted">Voided</span>}
                        </TD>
                      )}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
          {r.notes && (
            <div className="mt-4">
              <SectionTitle>Notes</SectionTitle>
              <Card><p className="text-sm whitespace-pre-wrap">{r.notes}</p></Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- action forms
function RecordPayment({
  receivableId, methods, openSchedules,
}: {
  receivableId: string;
  methods: { id: string; name: string }[];
  openSchedules: { id: string; due_date: string; outstanding: number }[];
}) {
  return (
    <FormDrawer
      triggerLabel="Record Payment"
      title="Record Payment"
      description="Records the transaction and auto-allocates it to the schedule."
      action={recordPayment}
      submitLabel="Record Payment"
    >
      <input type="hidden" name="receivable_id" value={receivableId} />
      <Field label="Amount Received" required>
        <MoneyInput name="amount" required />
      </Field>
      <Field label="Received Date" required>
        <Input type="date" name="received_date" defaultValue={todayISO()} required />
      </Field>
      <Field label="Payment Method">
        <Select name="payment_method_id" defaultValue="">
          <option value="">—</option>
          {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </Field>
      <Field label="Apply To" hint="Leave on auto to fill the earliest outstanding instalment first; overpayment flows to the next.">
        <Select name="target_schedule_id" defaultValue="">
          <option value="">Auto (earliest outstanding first)</option>
          {openSchedules.map((s) => (
            <option key={s.id} value={s.id}>
              {formatDate(s.due_date)} — {formatMYR(s.outstanding)} outstanding
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Reference / Transaction No.">
        <Input name="reference" />
      </Field>
      <Field label="Notes">
        <Textarea name="notes" />
      </Field>
    </FormDrawer>
  );
}

function ScheduleRow({
  receivableId, row,
}: {
  receivableId: string;
  row?: { id: string; due_date: string; expected_amount: number; notes: string | null };
}) {
  return (
    <FormDrawer
      triggerLabel={row ? "Edit" : "+ Add Instalment"}
      triggerVariant="secondary"
      title={row ? "Edit Instalment" : "Add Instalment"}
      action={saveScheduleRow}
      submitLabel="Save Instalment"
    >
      <input type="hidden" name="receivable_id" value={receivableId} />
      {row && <input type="hidden" name="id" value={row.id} />}
      <Field label="Due Date" required>
        <Input type="date" name="due_date" defaultValue={row?.due_date} required />
      </Field>
      <Field label="Expected Amount" required>
        <MoneyInput name="expected_amount" defaultValue={row?.expected_amount} required />
      </Field>
      <Field label="Notes">
        <Input name="notes" defaultValue={row?.notes ?? ""} />
      </Field>
    </FormDrawer>
  );
}

function EditReceivable({ r }: { r: import("@/lib/types").Receivable }) {
  return (
    <FormDrawer
      triggerLabel="Edit Deal"
      triggerVariant="secondary"
      title="Edit Receivable"
      action={updateReceivable}
      submitLabel="Save Changes"
    >
      <input type="hidden" name="id" value={r.id} />
      <Field label="Client / Company" required>
        <Input name="client_name" defaultValue={r.client_name} required />
      </Field>
      <Field label="Contact Name"><Input name="contact_name" defaultValue={r.contact_name ?? ""} /></Field>
      <Field label="Product / Program"><Input name="product" defaultValue={r.product ?? ""} /></Field>
      <Field label="Sales PIC"><Input name="sales_pic" defaultValue={r.sales_pic ?? ""} /></Field>
      <Field label="Deal Date"><Input type="date" name="deal_date" defaultValue={r.deal_date ?? ""} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Original Amount"><MoneyInput name="original_amount" defaultValue={r.original_amount} /></Field>
        <Field label="Total Receivable"><MoneyInput name="total_receivable" defaultValue={r.total_receivable} /></Field>
      </div>
      <Field label="Status">
        <Select name="status" defaultValue={r.status}>
          <option value="active">Active</option>
          <option value="on_hold">On Hold</option>
          <option value="stopped">Stopped</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </Field>
      <Field label="Remarks"><Input name="remarks" defaultValue={r.remarks ?? ""} /></Field>
      <Field label="HRDC Applicable">
        <label className="flex items-center gap-2 py-2 text-sm">
          <input type="checkbox" name="hrdc_applicable" defaultChecked={r.hrdc_applicable} className="h-4 w-4" /> Yes
        </label>
      </Field>
      <Field label="Notes"><Textarea name="notes" defaultValue={r.notes ?? ""} /></Field>
    </FormDrawer>
  );
}
