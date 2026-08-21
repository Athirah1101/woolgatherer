import { requireRole } from "@/lib/auth";
import { getExpenses } from "@/lib/data/expenses";
import { getCategories, getPaymentMethods, getProfiles, categoryName } from "@/lib/data/refs";
import type { Category, Expense, PaymentMethod } from "@/lib/types";
import {
  Card, EmptyState, PageHeader, StatusChip, SummaryCard,
  Table, TBody, TD, TH, THead, TR,
} from "@/components/ui";
import { Field, FormDrawer, InlineSubmit, Input, MoneyInput, Select, Textarea } from "@/components/form";
import { formatMYR, sumMoney } from "@/lib/finance/money";
import { formatDate, todayISO } from "@/lib/finance/dates";
import { expenseStatusChip } from "@/lib/finance/display";
import { cancelExpense, recordExpensePayment, saveExpense, verifyExpense } from "./actions";

const DEPARTMENTS = ["Sales", "Marketing", "Operations", "Finance", "Product", "HR", "Management"];

export default async function ExpensesPage() {
  const { profile } = await requireRole("finance", "management");
  const isFinance = profile.role === "finance";
  const expenses = await getExpenses();
  const cats = await getCategories("expense");
  const methods = await getPaymentMethods();
  const profiles = await getProfiles();
  const nameById = new Map(profiles.map((p) => [p.id, p.full_name ?? p.email ?? "—"]));

  const month = todayISO().slice(0, 7);
  const thisMonth = sumMoney(
    expenses.filter((e) => (e.invoice_date ?? "").slice(0, 7) === month).map((e) => e.amount),
  );
  const awaitingPayment = expenses.filter((e) => e.status === "new" || e.status === "awaiting_payment");
  const awaitingVerification = expenses.filter((e) => e.status === "awaiting_verification");

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="New → Awaiting Payment → Paid → Awaiting Verification → Verified."
        actions={isFinance ? <ExpenseForm cats={cats} /> : undefined}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Expenses This Month" value={formatMYR(thisMonth)} />
        <SummaryCard label="Awaiting Payment" value={awaitingPayment.length} tone="amber"
          sub={formatMYR(sumMoney(awaitingPayment.map((e) => e.amount)))} />
        <SummaryCard label="Awaiting Verification" value={awaitingVerification.length} tone="orange" />
      </div>

      {expenses.length === 0 ? (
        <EmptyState title="No expenses recorded yet." message="Add your first expense to start the workflow." action={isFinance ? <ExpenseForm cats={cats} /> : undefined} />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <TR>
                <TH>Vendor</TH><TH>Category</TH><TH>Dept</TH>
                <TH>Invoice</TH><TH right>Amount</TH><TH>Status</TH>
                <TH>Verified By</TH>{isFinance && <TH right>Actions</TH>}
              </TR>
            </THead>
            <TBody>
              {expenses.map((e) => {
                const chip = expenseStatusChip(e.status);
                return (
                  <TR key={e.id}>
                    <TD className="font-medium">
                      {e.vendor}
                      {e.description && <div className="text-xs text-muted">{e.description}</div>}
                    </TD>
                    <TD className="text-muted">{categoryName(cats, e.category_id)}</TD>
                    <TD className="text-muted">{e.department ?? "—"}</TD>
                    <TD>{formatDate(e.invoice_date)}</TD>
                    <TD right className="font-medium">{formatMYR(e.amount)}</TD>
                    <TD><StatusChip label={chip.label} tone={chip.tone} /></TD>
                    <TD className="text-muted">
                      {e.verified_by ? `${nameById.get(e.verified_by) ?? "—"} · ${formatDate(e.verified_date)}` : "—"}
                    </TD>
                    {isFinance && (
                      <TD right>
                        <div className="flex justify-end gap-1">
                          {(e.status === "new" || e.status === "awaiting_payment") && (
                            <RecordPayment e={e} methods={methods} />
                          )}
                          {e.status === "awaiting_verification" && (
                            <form action={verifyExpense}>
                              <input type="hidden" name="id" value={e.id} />
                              <InlineSubmit variant="primary">Verify</InlineSubmit>
                            </form>
                          )}
                          {e.status !== "verified" && e.status !== "cancelled" && (
                            <ExpenseForm cats={cats} e={e} />
                          )}
                          {e.status !== "verified" && e.status !== "cancelled" && (
                            <form action={cancelExpense}>
                              <input type="hidden" name="id" value={e.id} />
                              <InlineSubmit variant="danger" confirm="Cancel this expense?">Cancel</InlineSubmit>
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
  );
}

function ExpenseForm({ cats, e }: { cats: Category[]; e?: Expense }) {
  return (
    <FormDrawer
      triggerLabel={e ? "Edit" : "+ New Expense"}
      triggerVariant={e ? "secondary" : "primary"}
      title={e ? "Edit Expense" : "New Expense"}
      action={saveExpense}
      submitLabel="Save Expense"
    >
      {e && <input type="hidden" name="id" value={e.id} />}
      <Field label="Vendor" required><Input name="vendor" defaultValue={e?.vendor} required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <Select name="category_id" defaultValue={e?.category_id ?? ""}>
            <option value="">—</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Department">
          <Select name="department" defaultValue={e?.department ?? ""}>
            <option value="">—</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Description"><Input name="description" defaultValue={e?.description ?? ""} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Invoice Date"><Input type="date" name="invoice_date" defaultValue={e?.invoice_date ?? todayISO()} /></Field>
        <Field label="Received Date"><Input type="date" name="received_date" defaultValue={e?.received_date ?? ""} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" required><MoneyInput name="amount" defaultValue={e?.amount} required /></Field>
        <Field label="Due Date"><Input type="date" name="due_date" defaultValue={e?.due_date ?? ""} /></Field>
      </div>
      {!e && (
        <Field label="Initial Status">
          <Select name="status" defaultValue="awaiting_payment">
            <option value="new">New</option>
            <option value="awaiting_payment">Awaiting Payment</option>
          </Select>
        </Field>
      )}
      <Field label="Notes"><Textarea name="notes" defaultValue={e?.notes ?? ""} /></Field>
    </FormDrawer>
  );
}

function RecordPayment({ e, methods }: { e: Expense; methods: PaymentMethod[] }) {
  return (
    <FormDrawer
      triggerLabel="Record Payment"
      title="Record Expense Payment"
      description={`${e.vendor} — ${formatMYR(e.amount)}. This moves it to Awaiting Verification.`}
      action={recordExpensePayment}
      submitLabel="Record Payment"
    >
      <input type="hidden" name="id" value={e.id} />
      <Field label="Paid Date" required><Input type="date" name="paid_date" defaultValue={todayISO()} required /></Field>
      <Field label="Payment Method">
        <Select name="payment_method_id" defaultValue={e.payment_method_id ?? ""}>
          <option value="">—</option>
          {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </Field>
      <Field label="Reference"><Input name="reference" defaultValue={e.reference ?? ""} /></Field>
    </FormDrawer>
  );
}
