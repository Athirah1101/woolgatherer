import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getPayableRows } from "@/lib/data/payables";
import { getCategories, getPaymentMethods, categoryName } from "@/lib/data/refs";
import type { Category, Payable, PaymentMethod } from "@/lib/types";
import {
  AttentionBadge, Card, EmptyState, PageHeader, StatusChip, SummaryCard,
  Table, TBody, TD, TH, THead, TR, cn,
} from "@/components/ui";
import { DateWithToday, Field, FormDrawer, InlineSubmit, Input, MoneyInput, Select, Textarea } from "@/components/form";
import { formatMYR, sumMoney } from "@/lib/finance/money";
import { daysOverdue, formatDate, todayISO } from "@/lib/finance/dates";
import { payableAttentionChip } from "@/lib/finance/display";
import { owedAmount } from "@/lib/finance/payables";
import { SortControl, type SortOption } from "@/components/SortControl";
import { SearchBox } from "@/components/SearchBox";
import { AgingChart, buildAging } from "@/components/AgingChart";
import { cancelPayable, markPayablePaid, savePayable } from "./actions";

export default async function PayablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { profile } = await requireRole("finance", "management");
  const isFinance = profile.role === "finance";
  const sp = await searchParams;
  const rows = await getPayableRows();
  const cats = await getCategories("payable");
  const methods = await getPaymentMethods();

  // "Still owed" = unpaid or partially paid; metrics use the remaining amount.
  const owing = (r: { payable: Payable }) =>
    r.payable.status === "unpaid" || r.payable.status === "partially_paid";
  const today = todayISO();
  const unpaid = rows.filter(owing);
  // Aged payables: each still-owed bill bucketed by how overdue it is.
  const agingPayables = buildAging(
    unpaid.map((r) => ({
      amount: owedAmount(r.payable),
      daysOverdue: r.payable.due_date ? daysOverdue(r.payable.due_date, today) : 0,
    })),
  );
  const overdue = sumMoney(unpaid.filter((r) => r.attention.level === "overdue").map((r) => owedAmount(r.payable)));
  const dueToday = sumMoney(unpaid.filter((r) => r.attention.level === "due_today").map((r) => owedAmount(r.payable)));
  const due3 = sumMoney(unpaid.filter((r) => r.attention.level === "due_3").map((r) => owedAmount(r.payable)));
  const due7 = sumMoney(unpaid.filter((r) => r.attention.level === "due_7").map((r) => owedAmount(r.payable)));

  // Running total still owed to Joseph Chua (unpaid/partial paybacks to him).
  const owedJoseph = sumMoney(
    rows
      .filter((r) => owing(r) && r.payable.payee?.toLowerCase() === "joseph chua")
      .map((r) => owedAmount(r.payable)),
  );

  // ---- View filter: default hides paid so the list stays short ----
  const paidCount = rows.filter((r) => r.payable.status === "paid").length;
  const view = sp.view === "paid" || sp.view === "all" ? sp.view : "unpaid";
  const q = (sp.q ?? "").trim().toLowerCase();
  let filtered =
    view === "all" ? rows : view === "paid" ? rows.filter((r) => r.payable.status === "paid") : rows.filter(owing);
  if (q)
    filtered = filtered.filter(
      (r) =>
        r.payable.payee?.toLowerCase().includes(q) ||
        (r.payable.description ?? "").toLowerCase().includes(q),
    );
  const VIEWS: { key: string; label: string; count: number }[] = [
    { key: "unpaid", label: "To Pay", count: unpaid.length },
    { key: "paid", label: "Paid", count: paidCount },
    { key: "all", label: "All", count: rows.length },
  ];

  // Sort
  const SORTS: SortOption[] = [
    { value: "due_asc", label: "Due date (soonest)" },
    { value: "due_desc", label: "Due date (latest)" },
    { value: "amount_desc", label: "Amount (high → low)" },
    { value: "amount_asc", label: "Amount (low → high)" },
    { value: "payee_az", label: "Payee (A → Z)" },
  ];
  const sort = SORTS.some((s) => s.value === sp.sort) ? sp.sort! : "due_asc";
  const shown = [...filtered].sort((a, b) => {
    const pa = a.payable, pb = b.payable;
    switch (sort) {
      case "due_desc": return (pb.due_date ?? "").localeCompare(pa.due_date ?? "");
      case "amount_desc": return pb.amount - pa.amount;
      case "amount_asc": return pa.amount - pb.amount;
      case "payee_az": return (pa.payee ?? "").localeCompare(pb.payee ?? "");
      default: return (pa.due_date ?? "").localeCompare(pb.due_date ?? "");
    }
  });

  // Distinct vendor names, for the payee auto-complete list.
  const vendors = [...new Set(rows.map((r) => r.payable.payee).filter(Boolean))].sort();

  return (
    <div>
      {/* Shared vendor suggestions — referenced by every payee input via list="payable-vendors". */}
      <datalist id="payable-vendors">
        {vendors.map((v) => <option key={v} value={v} />)}
      </datalist>

      <PageHeader
        title="Payables"
        subtitle="Money Vertex Mastery needs to pay. Attention is calculated automatically."
        actions={isFinance ? <PayableForm cats={cats} methods={methods} /> : undefined}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Overdue" value={formatMYR(overdue)} tone="red" />
        <SummaryCard label="Due Today" value={formatMYR(dueToday)} tone="orange" />
        <SummaryCard label="Due Within 3 Days" value={formatMYR(due3)} tone="amber" />
        <SummaryCard label="Due Within 7 Days" value={formatMYR(due7)} tone="blue" />
      </div>

      {owedJoseph > 0 && (
        <div className="mb-6 max-w-sm">
          <SummaryCard
            label="Owed to Joseph Chua"
            value={formatMYR(owedJoseph)}
            tone="indigo"
            sub="Total still to repay for spending via the Joseph Chua method"
          />
        </div>
      )}

      <div className="mb-6">
        <AgingChart title="Aged Payables" buckets={agingPayables} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={v.key === "unpaid" ? "/payables" : `/payables?view=${v.key}`}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition",
                view === v.key ? "bg-brand text-white" : "border border-border bg-surface hover:bg-gray-50",
              )}
            >
              {v.label} <span className="opacity-70">({v.count})</span>
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <SearchBox placeholder="Search payee or description…" className="w-56" />
          <SortControl options={SORTS} />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No payables yet."
          message="Add a one-off payable, or set up recurring rules in Settings → Recurring Payables."
        />
      ) : shown.length === 0 ? (
        <EmptyState
          title={view === "paid" ? "No paid payables yet." : "Nothing here."}
          message={view === "paid" ? "Payables you mark as paid will show up here." : "Try a different filter."}
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
              {shown.map(({ payable: p, attention }) => {
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
                    <TD right className="font-medium">
                      {formatMYR(p.status === "paid" ? p.paid_amount ?? p.amount : p.amount)}
                      {p.status === "partially_paid" && (
                        <div className="text-xs font-normal text-muted">
                          {formatMYR(p.paid_amount ?? 0)} paid · {formatMYR(owedAmount(p))} left
                        </div>
                      )}
                    </TD>
                    <TD>
                      <StatusChip
                        label={
                          p.status === "paid" ? "Paid"
                          : p.status === "partially_paid" ? "Partially Paid"
                          : p.status === "cancelled" ? "Cancelled" : "Unpaid"
                        }
                        tone={
                          p.status === "paid" ? "green"
                          : p.status === "partially_paid" ? "blue"
                          : p.status === "cancelled" ? "gray" : "amber"
                        }
                      />
                    </TD>
                    <TD><AttentionBadge label={chip.label} tone={chip.tone} /></TD>
                    {isFinance && (
                      <TD right>
                        <div className="flex flex-wrap justify-end gap-1">
                          {(p.status === "unpaid" || p.status === "partially_paid") && (
                            <>
                              <MarkPaid p={p} methods={methods} />
                              <PayableForm cats={cats} methods={methods} p={p} />
                              <form action={cancelPayable}>
                                <input type="hidden" name="id" value={p.id} />
                                <InlineSubmit variant="danger" confirm="Cancel this payable?">Cancel</InlineSubmit>
                              </form>
                            </>
                          )}
                          <PayableAddForVendor cats={cats} methods={methods} p={p} />
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

/** Prefill for a brand-new payable (used to add another bill to an existing vendor). */
interface PayableDefaults {
  payee?: string;
  category_id?: string | null;
  payment_method_id?: string | null;
}

function PayableForm({
  cats, methods, p, defaults, trigger,
}: {
  cats: Category[];
  methods: PaymentMethod[];
  p?: Payable;                 // present = edit existing
  defaults?: PayableDefaults;  // present (with no p) = new payable, pre-filled
  trigger?: { label: string; variant?: "primary" | "secondary" };
}) {
  // Edit uses the existing row; a new payable falls back to any prefilled defaults.
  const payee = p?.payee ?? defaults?.payee ?? "";
  const categoryId = p?.category_id ?? defaults?.category_id ?? "";
  const methodId = p?.payment_method_id ?? defaults?.payment_method_id ?? "";
  const label = trigger?.label ?? (p ? "Edit" : "+ New Payable");
  const variant = trigger?.variant ?? (p ? "secondary" : "primary");

  return (
    <FormDrawer
      triggerLabel={label}
      triggerVariant={variant}
      title={p ? "Edit Payable" : defaults?.payee ? `New Payable — ${defaults.payee}` : "New Payable"}
      action={savePayable}
      submitLabel="Save Payable"
    >
      {p && <input type="hidden" name="id" value={p.id} />}
      <Field label="Payee / Vendor" required>
        <Input name="payee" defaultValue={payee} list="payable-vendors" required />
      </Field>
      <Field label="Category">
        <Select name="category_id" defaultValue={categoryId}>
          <option value="">—</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Description"><Input name="description" defaultValue={p?.description ?? ""} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" required><MoneyInput name="amount" defaultValue={p?.amount} required /></Field>
        <Field label="Due Date" required><DateWithToday name="due_date" defaultValue={p?.due_date ?? todayISO()} required /></Field>
      </div>
      <Field label="Payment Method">
        <Select name="payment_method_id" defaultValue={methodId}>
          <option value="">—</option>
          {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </Field>
      <Field label="Notes"><Textarea name="notes" defaultValue={p?.notes ?? ""} /></Field>
    </FormDrawer>
  );
}

/** Quick "+ Add" that opens a new payable pre-filled with this vendor's details. */
function PayableAddForVendor({
  cats, methods, p,
}: {
  cats: Category[];
  methods: PaymentMethod[];
  p: Payable;
}) {
  return (
    <PayableForm
      cats={cats}
      methods={methods}
      defaults={{ payee: p.payee, category_id: p.category_id, payment_method_id: p.payment_method_id }}
      trigger={{ label: "+ Add", variant: "secondary" }}
    />
  );
}

function MarkPaid({ p, methods }: { p: Payable; methods: PaymentMethod[] }) {
  const remaining = owedAmount(p);
  const partial = p.status === "partially_paid";
  return (
    <FormDrawer
      triggerLabel={partial ? "Record Payment" : "Mark Paid"}
      title="Record Payment"
      description={`${p.payee} — ${formatMYR(remaining)} remaining${partial ? ` of ${formatMYR(p.amount)}` : ""}`}
      action={markPayablePaid}
      submitLabel="Save Payment"
    >
      <input type="hidden" name="id" value={p.id} />
      <Field label="Amount Paid Now" required hint="Enter less than the amount remaining to record a partial payment.">
        <MoneyInput name="paid_amount" defaultValue={remaining} required />
      </Field>
      <Field label="Paid Date" required><DateWithToday name="paid_date" defaultValue={todayISO()} required /></Field>
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
