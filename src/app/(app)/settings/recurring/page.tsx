import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getRecurringRules } from "@/lib/data/payables";
import { getCategories, getPaymentMethods, categoryName, methodName } from "@/lib/data/refs";
import type { Category, PaymentMethod, RecurringPayable } from "@/lib/types";
import {
  buttonClass, Card, Chip, EmptyState, PageHeader, SummaryCard, Table, TBody, TD, TH, THead, TR,
} from "@/components/ui";
import { DateWithToday, Field, FormDrawer, Input, MoneyInput, Select, Textarea } from "@/components/form";
import { formatMYR, sumMoney } from "@/lib/finance/money";
import { todayISO, startOfMonth, endOfMonth } from "@/lib/finance/dates";
import { dueDatesForRule } from "@/lib/finance/payables";
import { SortControl, type SortOption } from "@/components/SortControl";
import { generateRecurringPayables, saveRecurring } from "../../payables/actions";
import { FrequencyFields } from "./FrequencyFields";

const RULE_SORTS: SortOption[] = [
  { value: "name_az", label: "Name (A → Z)" },
  { value: "name_za", label: "Name (Z → A)" },
  { value: "amount_desc", label: "Amount (high → low)" },
  { value: "amount_asc", label: "Amount (low → high)" },
  { value: "due_day", label: "Due day" },
];

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
/** Human label for a rule's due timing, e.g. "Day 15" or "15 Mar". */
function dueLabel(r: RecurringPayable): string {
  if (r.frequency !== "monthly" && r.due_month)
    return `${r.due_day} ${MONTH_ABBR[r.due_month - 1]}`;
  return `Day ${r.due_day}`;
}

/** Annualised amount (in sen) for a rule, based on its frequency. */
function annualAmount(r: RecurringPayable): number {
  if (!r.active) return 0;
  const perYear = r.frequency === "monthly" ? 12 : r.frequency === "quarterly" ? 4 : 1;
  return r.default_amount * perYear;
}

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole("finance");
  const sp = await searchParams;
  const [allRules, cats, methods] = await Promise.all([
    getRecurringRules(),
    getCategories("payable"),
    getPaymentMethods(),
  ]);

  const sort = RULE_SORTS.some((s) => s.value === sp.sort) ? sp.sort! : "name_az";
  const rules = [...allRules].sort((a, b) => {
    switch (sort) {
      case "name_za": return b.name.localeCompare(a.name);
      case "amount_desc": return b.default_amount - a.default_amount;
      case "amount_asc": return a.default_amount - b.default_amount;
      case "due_day": return a.due_day - b.due_day;
      default: return a.name.localeCompare(b.name);
    }
  });

  // ---- Overview / forecast ----
  const today = todayISO();
  const activeRules = rules.filter((r) => r.active);
  const annualForecast = sumMoney(rules.map(annualAmount));
  const monthlyForecast = Math.round(annualForecast / 12);
  const dueThisMonth = sumMoney(
    rules.flatMap((r) =>
      dueDatesForRule(r, startOfMonth(today), endOfMonth(today)).map(() => r.default_amount),
    ),
  );

  return (
    <div>
      <PageHeader
        title="Recurring Payables"
        subtitle="Set a rule once — FinanceOS generates each month's payable automatically."
        actions={
          <div className="flex gap-2">
            <form action={generateRecurringPayables}>
              <button className={buttonClass("secondary")}>Generate this month</button>
            </form>
            <RuleForm cats={cats} methods={methods} />
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Forecasted Monthly" value={formatMYR(monthlyForecast)} tone="blue" sub="Average run-rate across all active rules" />
        <SummaryCard label="Forecasted Yearly" value={formatMYR(annualForecast)} tone="indigo" sub="Total committed for a full year" />
        <SummaryCard label="Due This Month" value={formatMYR(dueThisMonth)} tone="amber" sub="What these rules bill this month" />
        <SummaryCard label="Active Rules" value={activeRules.length} tone="green" sub={`${rules.length} total`} />
      </div>

      {rules.length > 0 && (
        <div className="mb-3 flex justify-end">
          <SortControl options={RULE_SORTS} />
        </div>
      )}

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
                <TH>Name</TH><TH>Category</TH><TH>Payment Method</TH><TH>Frequency</TH><TH>Due Day</TH>
                <TH right>Default Amount</TH><TH>Amount</TH><TH>Status</TH><TH right>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rules.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">
                    <Link href={`/settings/recurring/${r.id}`} className="hover:text-brand hover:underline">
                      {r.name}
                    </Link>
                    {r.payee && r.payee !== r.name && <div className="text-xs text-muted">{r.payee}</div>}
                  </TD>
                  <TD className="text-muted">{categoryName(cats, r.category_id)}</TD>
                  <TD className="text-muted">{methodName(methods, r.payment_method_id)}</TD>
                  <TD className="capitalize">{r.frequency}</TD>
                  <TD>{dueLabel(r)}</TD>
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
      <FrequencyFields
        defaultFrequency={rule?.frequency ?? "monthly"}
        defaultDueDay={rule?.due_day ?? 1}
        defaultDueMonth={rule?.due_month}
      />
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
        <Field label="Start Date" required><DateWithToday name="start_date" defaultValue={rule?.start_date ?? todayISO()} required /></Field>
        <Field label="End Date (optional)"><DateWithToday name="end_date" defaultValue={rule?.end_date ?? ""} /></Field>
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
