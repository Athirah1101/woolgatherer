import { requireRole } from "@/lib/auth";
import { getPayableRows } from "@/lib/data/payables";
import { getCategories, getPaymentMethods, categoryName } from "@/lib/data/refs";
import type { Category, Payable, PaymentMethod } from "@/lib/types";
import {
  AttentionBadge, Card, EmptyState, PageHeader, StatusChip, SummaryCard,
  Table, TBody, TD, TH, THead, TR,
} from "@/components/ui";
import { Field, FormDrawer, InlineSubmit, Input, MoneyInput, Select, Textarea } from "@/components/form";
import { formatMYR, sumMoney } from "@/lib/finance/money";
import { formatDate, todayISO } from "@/lib/finance/dates";
import { payableAttentionChip } from "@/lib/finance/display";
import { cancelPayable, markPayablePaid, savePayable } from "./actions";

export default async function PayablesPage() {
  const { profile } = await requireRole("finance", "management");
  const isFinance = profile.role === "finance";
  const rows = await getPayableRows();
  const cats = await getCategories("payable");
  const methods = await getPaymentMethods();

  const unpaid = rows.filter((r) => r.payable.status === "unpaid");
  const overdue = sumMoney(unpaid.filter((r) => r.attention.level === "overdue").map((r) => r.payable.amount));
  const dueToday = sumMoney(unpaid.filter((r) => r.attention.level === "due_today").map((r) => r.payable.amount));
  const due3 = sumMoney(unpaid.filter((r) => r.attention.level === "due_3").map((r) => r.payable.amount));
  const due7 = sumMoney(unpaid.filter((r) => r.attention.level === "due_7").map((r) => r.payable.amount));

  return (
    <div>
      <PageHeader
        title="Payables"
        subtitle="Money Vertex Mastery needs to pay. Attention is calculated automatically."
        actions={isFinance ? <PayableForm cats={cats} methods={methods} /> : undefined}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard label="Overdue" value={formatMYR(overdue)} tone="red" />
        <SummaryCard label="Due Today" value={formatMYR(dueToday)} tone="orange" />
        <SummaryCard label="Due Within 3 Days" value={formatMYR(due3)} tone="amber" />
        <SummaryCard label="Due Within 7 Days" value={formatMYR(due7)} tone="blue" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No payables yet."
          message="Add a one-off payable, or set up recurring rules in Settings → Recurring Payables."
        />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <TR>
                <TH>Payee</TH>
                <TH>Category</TH>
                <TH>Due Date</TH>
                <TH right>Amount</TH>
                <TH>Status</TH>
                <TH>Attention</TH>
                {isFinance && <TH right>Actions</TH>}
              </TR>
            </THead>
            <TBody>
              {rows.map(({ payable: p, attention }) => {
                const chip = payableAttentionChip(attention.level);
                return (
                  <TR key={p.id}>
                    <TD className="font-medium">
                      {p.payee}
                      {p.recurring_rule_id && <span className="ml-2 text-xs text-muted">(recurring)</span>}
                      {p.description && <div className="text-xs text-muted">{p.description}</div>}
                    </TD>
                    <TD className="text-muted">{categoryName(cats, p.category_id)}</TD>
                    <TD>{formatDate(p.due_date)}</TD>
                    <TD right className="font-medium">{formatMYR(p.status === "paid" ? p.paid_amount ?? p.amount : p.amount)}</TD>
                    <TD>
                      <StatusChip
                        label={p.status === "paid" ? "Paid" : p.status === "cancelled" ? "Cancelled" : "Unpaid"}
                        tone={p.status === "paid" ? "green" : p.status === "cancelled" ? "gray" : "amber"}
                      />
                    </TD>
                    <TD><AttentionBadge label={chip.label} tone={chip.tone} /></TD>
                    {isFinance && (
                      <TD right>
                        {p.status === "unpaid" ? (
                          <div className="flex justify-end gap-1">
                            <MarkPaid p={p} methods={methods} />
                            <PayableForm cats={cats} methods={methods} p={p} />
                            <form action={cancelPayable}>
                              <input type="hidden" name="id" value={p.id} />
                              <InlineSubmit variant="danger" confirm="Cancel this payable?">Cancel</InlineSubmit>
                            </form>
                          </div>
                        ) : (
                          <span className="text-xs text-muted">
                            {p.status === "paid" ? formatDate(p.paid_date) : "—"}
                          </span>
                        )}
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
  );
}

function PayableForm({
  cats, methods, p,
}: {
  cats: Category[];
  methods: PaymentMethod[];
  p?: Payable;
}) {
  return (
    <FormDrawer
      triggerLabel={p ? "Edit" : "+ New Payable"}
      triggerVariant={p ? "secondary" : "primary"}
      title={p ? "Edit Payable" : "New Payable"}
      action={savePayable}
      submitLabel="Save Payable"
    >
      {p && <input type="hidden" name="id" value={p.id} />}
      <Field label="Payee / Vendor" required><Input name="payee" defaultValue={p?.payee} required /></Field>
      <Field label="Category">
        <Select name="category_id" defaultValue={p?.category_id ?? ""}>
          <option value="">—</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Description"><Input name="description" defaultValue={p?.description ?? ""} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" required><MoneyInput name="amount" defaultValue={p?.amount} required /></Field>
        <Field label="Due Date" required><Input type="date" name="due_date" defaultValue={p?.due_date ?? todayISO()} required /></Field>
      </div>
      <Field label="Payment Method">
        <Select name="payment_method_id" defaultValue={p?.payment_method_id ?? ""}>
          <option value="">—</option>
          {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </Field>
      <Field label="Notes"><Textarea name="notes" defaultValue={p?.notes ?? ""} /></Field>
    </FormDrawer>
  );
}

function MarkPaid({ p, methods }: { p: Payable; methods: PaymentMethod[] }) {
  return (
    <FormDrawer
      triggerLabel="Mark Paid"
      title="Record Payment"
      description={`${p.payee} — due ${formatDate(p.due_date)}`}
      action={markPayablePaid}
      submitLabel="Mark Paid"
    >
      <input type="hidden" name="id" value={p.id} />
      <Field label="Actual Amount Paid" required hint="For variable bills (EPF, utilities) enter the real amount.">
        <MoneyInput name="paid_amount" defaultValue={p.amount} required />
      </Field>
      <Field label="Paid Date" required><Input type="date" name="paid_date" defaultValue={todayISO()} required /></Field>
      <Field label="Payment Method">
        <Select name="payment_method_id" defaultValue={p.payment_method_id ?? ""}>
          <option value="">—</option>
          {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </Field>
      <Field label="Reference"><Input name="reference" /></Field>
    </FormDrawer>
  );
}
