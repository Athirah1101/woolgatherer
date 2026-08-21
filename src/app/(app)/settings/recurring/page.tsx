import { requireRole } from "@/lib/auth";
import { getRecurringRules } from "@/lib/data/payables";
import { getCategories, getPaymentMethods, categoryName } from "@/lib/data/refs";
import type { Category, PaymentMethod, RecurringPayable } from "@/lib/types";
import {
  buttonClass, Card, Chip, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR,
} from "@/components/ui";
import { Field, FormDrawer, Input, MoneyInput, Select, Textarea } from "@/components/form";
import { formatMYR } from "@/lib/finance/money";
import { todayISO } from "@/lib/finance/dates";
import { generateRecurringPayables, saveRecurring } from "../../payables/actions";

export default async function RecurringPage() {
  await requireRole("finance");
  const rules = await getRecurringRules();
  const cats = await getCategories("payable");
  const methods = await getPaymentMethods();

  return (
    <div>
      <PageHeader
        title="Recurring Payables"
        subtitle="Set a rule once — FinanceOS generates each month's payable automatically."
        actions={
          <div className="flex gap-2">
            <form action={generateRecurringPayables}>
              <button className={buttonClass("secondary")}>Generate upcoming (3 months)</button>
            </form>
            <RuleForm cats={cats} methods={methods} />
          </div>
        }
      />

      {rules.length === 0 ? (
        <EmptyState
          title="No recurring rules yet."
          message="Add EPF, SOCSO, rental, subscriptions and other recurring charges once."
          action={<RuleForm cats={cats} methods={methods} />}
        />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH><TH>Category</TH><TH>Frequency</TH><TH>Due Day</TH>
                <TH right>Default Amount</TH><TH>Amount</TH><TH>Status</TH><TH right>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rules.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">
                    {r.name}
                    {r.payee && r.payee !== r.name && <div className="text-xs text-muted">{r.payee}</div>}
                  </TD>
                  <TD className="text-muted">{categoryName(cats, r.category_id)}</TD>
                  <TD className="capitalize">{r.frequency}</TD>
                  <TD>Day {r.due_day}</TD>
                  <TD right>{formatMYR(r.default_amount)}</TD>
                  <TD><Chip tone={r.amount_type === "variable" ? "amber" : "gray"}>{r.amount_type}</Chip></TD>
                  <TD><Chip tone={r.active ? "green" : "gray"}>{r.active ? "Active" : "Inactive"}</Chip></TD>
                  <TD right><RuleForm cats={cats} methods={methods} rule={r} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function RuleForm({
  cats, methods, rule,
}: {
  cats: Category[];
  methods: PaymentMethod[];
  rule?: RecurringPayable;
}) {
  return (
    <FormDrawer
      triggerLabel={rule ? "Edit" : "+ New Rule"}
      triggerVariant={rule ? "secondary" : "primary"}
      title={rule ? "Edit Recurring Rule" : "New Recurring Rule"}
      action={saveRecurring}
      submitLabel="Save Rule"
    >
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <Field label="Name" required><Input name="name" defaultValue={rule?.name} placeholder="e.g. EPF, Office Rental" required /></Field>
      <Field label="Vendor / Payee"><Input name="payee" defaultValue={rule?.payee ?? ""} /></Field>
      <Field label="Category">
        <Select name="category_id" defaultValue={rule?.category_id ?? ""}>
          <option value="">—</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Frequency">
          <Select name="frequency" defaultValue={rule?.frequency ?? "monthly"}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </Field>
        <Field label="Due Day (of month)"><Input type="number" name="due_day" min={1} max={31} defaultValue={rule?.due_day ?? 1} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Default Amount"><MoneyInput name="default_amount" defaultValue={rule?.default_amount ?? 0} /></Field>
        <Field label="Amount Type" hint="Variable = editable each month (e.g. EPF).">
          <Select name="amount_type" defaultValue={rule?.amount_type ?? "fixed"}>
            <option value="fixed">Fixed</option>
            <option value="variable">Variable</option>
          </Select>
        </Field>
      </div>
      <Field label="Payment Method">
        <Select name="payment_method_id" defaultValue={rule?.payment_method_id ?? ""}>
          <option value="">—</option>
          {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start Date" required><Input type="date" name="start_date" defaultValue={rule?.start_date ?? todayISO()} required /></Field>
        <Field label="End Date (optional)"><Input type="date" name="end_date" defaultValue={rule?.end_date ?? ""} /></Field>
      </div>
      <Field label="Status">
        <Select name="active" defaultValue={rule?.active === false ? "false" : "true"}>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
      </Field>
      <Field label="Notes"><Textarea name="notes" defaultValue={rule?.notes ?? ""} /></Field>
    </FormDrawer>
  );
}
