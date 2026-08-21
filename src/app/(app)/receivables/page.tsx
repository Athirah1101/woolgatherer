import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getReceivableRows } from "@/lib/data/receivables";
import { getSalesPics } from "@/lib/data/refs";
import {
  AttentionBadge, Card, Chip, EmptyState, PageHeader, StatusChip,
  SummaryCard, Table, TBody, TD, TH, THead, TR,
} from "@/components/ui";
import { formatMYR, sumMoney } from "@/lib/finance/money";
import { formatDate, todayISO, daysUntil } from "@/lib/finance/dates";
import { collectionStatusChip, receivableAttention } from "@/lib/finance/display";
import { NewReceivable } from "./NewReceivable";
import { FilterBar } from "./FilterBar";

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { profile } = await requireSession();
  const sp = await searchParams;
  const today = todayISO();
  const isSalesView = profile.role === "sales" || Boolean(sp.as);
  const asPic = sp.as;

  let rows = await getReceivableRows();
  const salesPics = await getSalesPics();

  // Finance "View As: Sales" preview
  if (asPic) rows = rows.filter((r) => r.receivable.sales_pic === asPic);

  // filters
  const q = (sp.q ?? "").toLowerCase();
  if (q)
    rows = rows.filter(
      (r) =>
        r.receivable.client_name.toLowerCase().includes(q) ||
        (r.receivable.product ?? "").toLowerCase().includes(q),
    );
  if (sp.pic) rows = rows.filter((r) => r.receivable.sales_pic === sp.pic);
  if (sp.hrdc === "yes") rows = rows.filter((r) => r.receivable.hrdc_applicable);
  if (sp.hrdc === "no") rows = rows.filter((r) => !r.receivable.hrdc_applicable);
  switch (sp.quick) {
    case "outstanding": rows = rows.filter((r) => r.summary.outstanding > 0); break;
    case "overdue": rows = rows.filter((r) => r.summary.overdueAmount > 0); break;
    case "paid": rows = rows.filter((r) => r.summary.collectionStatus === "paid"); break;
    case "due_week":
      rows = rows.filter(
        (r) => r.summary.nextDueDate && r.summary.outstanding > 0 &&
          daysUntil(r.summary.nextDueDate, today) >= 0 && daysUntil(r.summary.nextDueDate, today) <= 7,
      );
      break;
    case "due_month":
      rows = rows.filter(
        (r) => r.summary.nextDueDate && r.summary.outstanding > 0 &&
          r.summary.nextDueDate.slice(0, 7) === today.slice(0, 7),
      );
      break;
  }

  const totalOutstanding = sumMoney(rows.map((r) => r.summary.outstanding));
  const totalOverdue = sumMoney(rows.map((r) => r.summary.overdueAmount));
  const totalCollected = sumMoney(rows.map((r) => r.summary.totalPaid));

  return (
    <div>
      <PageHeader
        title="Receivables"
        subtitle={
          isSalesView
            ? "Collection view — the deals assigned to you."
            : "Track every deal from schedule to collection."
        }
        actions={profile.role === "finance" && !asPic ? <NewReceivable salesPics={salesPics} /> : undefined}
      />

      {asPic && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span>Previewing what <strong>{asPic}</strong> sees in the Sales view.</span>
          <Link href="/receivables" className="font-medium underline">Exit preview</Link>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Outstanding" value={formatMYR(totalOutstanding)} tone="amber" />
        <SummaryCard label="Overdue" value={formatMYR(totalOverdue)} tone="red" />
        <SummaryCard label="Collected" value={formatMYR(totalCollected)} tone="green" />
      </div>

      <FilterBar salesPics={salesPics} showSalesPic={!isSalesView} />

      {profile.role === "finance" && !asPic && salesPics.length > 0 && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted">
          <span>View as Sales:</span>
          {salesPics.map((p) => (
            <Link key={p} href={`/receivables?as=${encodeURIComponent(p)}`} className="rounded-full border border-border bg-surface px-2.5 py-1 hover:bg-gray-50">
              {p}
            </Link>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No receivables match this view."
          message={sp.quick || q ? "Try clearing the filters." : "Create your first receivable to start tracking collection."}
        />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <TR>
                <TH>Client</TH>
                <TH>Product</TH>
                {!isSalesView && <TH>Sales PIC</TH>}
                <TH right>Deal Amount</TH>
                <TH right>Paid</TH>
                <TH right>Outstanding</TH>
                <TH right>Overdue</TH>
                <TH>Next Payment</TH>
                <TH>Status</TH>
                <TH>Attention</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ receivable: r, summary }) => {
                const status = collectionStatusChip(summary.collectionStatus);
                const attn = receivableAttention(summary, today);
                return (
                  <TR key={r.id}>
                    <TD className="font-medium">
                      <Link href={`/receivables/${r.id}`} className="hover:text-brand hover:underline">
                        {r.client_name}
                      </Link>
                      {r.hrdc_applicable && <Chip tone="indigo" className="ml-2">HRDC</Chip>}
                    </TD>
                    <TD className="text-muted">{r.product ?? "—"}</TD>
                    {!isSalesView && <TD>{r.sales_pic ?? "—"}</TD>}
                    <TD right>{formatMYR(r.total_receivable)}</TD>
                    <TD right className="text-emerald-700">{formatMYR(summary.totalPaid)}</TD>
                    <TD right className="font-medium">{formatMYR(summary.outstanding)}</TD>
                    <TD right className={summary.overdueAmount > 0 ? "font-medium text-red-600" : "text-muted"}>
                      {summary.overdueAmount > 0 ? formatMYR(summary.overdueAmount) : "—"}
                    </TD>
                    <TD>
                      {summary.nextDueDate ? (
                        <div className="whitespace-nowrap">
                          <div>{formatDate(summary.nextDueDate)}</div>
                          <div className="text-xs text-muted">{formatMYR(summary.nextDueAmount)}</div>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TD>
                    <TD><StatusChip label={status.label} tone={status.tone} /></TD>
                    <TD><AttentionBadge label={attn.label} tone={attn.tone} /></TD>
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
