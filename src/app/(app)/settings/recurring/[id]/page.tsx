import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getRecurringDetail } from "@/lib/data/payables";
import { getCategories, getPaymentMethods, categoryName, methodName } from "@/lib/data/refs";
import {
  ButtonLink, Card, Chip, EmptyState, PageHeader, SummaryCard,
  Table, TBody, TD, TH, THead, TR,
} from "@/components/ui";
import { formatMYR, sumMoney } from "@/lib/finance/money";
import { formatDate } from "@/lib/finance/dates";

export default async function RecurringDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("finance");
  const { id } = await params;
  const [detail, cats, methods] = await Promise.all([
    getRecurringDetail(id),
    getCategories("payable"),
    getPaymentMethods(),
  ]);
  if (!detail) notFound();
  const { rule, payables } = detail;

  const paid = payables.filter((p) => p.status === "paid");
  const totalPaid = sumMoney(paid.map((p) => p.paid_amount ?? p.amount));
  const unpaidCount = payables.filter((p) => p.status === "unpaid").length;

  return (
    <div>
      <PageHeader
        title={rule.name}
        subtitle={`Recurring ${rule.frequency} payable${rule.payee ? ` — ${rule.payee}` : ""}`}
        actions={<ButtonLink href="/settings/recurring" variant="secondary">← Back</ButtonLink>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard label="Default Amount" value={formatMYR(rule.default_amount)} tone="blue" />
        <SummaryCard label="Total Paid (all time)" value={formatMYR(totalPaid)} tone="green" sub={`${paid.length} payment(s)`} />
        <SummaryCard label="Outstanding Bills" value={unpaidCount} tone={unpaidCount ? "amber" : "neutral"} />
        <SummaryCard label="Status" value={rule.active ? "Active" : "Inactive"} tone={rule.active ? "green" : "gray"} />
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div><div className="text-xs uppercase text-muted">Category</div>{categoryName(cats, rule.category_id)}</div>
          <div><div className="text-xs uppercase text-muted">Payment Method</div>{methodName(methods, rule.payment_method_id)}</div>
          <div><div className="text-xs uppercase text-muted">Frequency</div><span className="capitalize">{rule.frequency}</span></div>
          <div><div className="text-xs uppercase text-muted">Amount Type</div><span className="capitalize">{rule.amount_type}</span></div>
        </div>
        {rule.notes && <p className="mt-4 text-sm text-muted">{rule.notes}</p>}
      </Card>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Payment History</h2>
      {payables.length === 0 ? (
        <EmptyState
          title="No payables generated yet."
          message="Use 'Generate this month' on the Recurring Payables page to create this month's bill."
        />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <TR>
                <TH>Due Date</TH><TH right>Amount</TH><TH>Status</TH>
                <TH>Paid Date</TH><TH right>Paid Amount</TH><TH>Method</TH>
              </TR>
            </THead>
            <TBody>
              {payables.map((p) => (
                <TR key={p.id}>
                  <TD>{formatDate(p.due_date)}</TD>
                  <TD right>{formatMYR(p.amount)}</TD>
                  <TD>
                    <Chip tone={p.status === "paid" ? "green" : p.status === "cancelled" ? "gray" : "amber"}>
                      {p.status === "paid" ? "Paid" : p.status === "cancelled" ? "Cancelled" : "Unpaid"}
                    </Chip>
                  </TD>
                  <TD className="text-muted">{p.paid_date ? formatDate(p.paid_date) : "—"}</TD>
                  <TD right>{p.paid_amount != null ? formatMYR(p.paid_amount) : "—"}</TD>
                  <TD className="text-muted">{methodName(methods, p.payment_method_id)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
