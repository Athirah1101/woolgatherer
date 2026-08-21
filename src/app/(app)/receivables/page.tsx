import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getReceivableRows } from "@/lib/data/receivables";
import { getSalesPics } from "@/lib/data/refs";
import { PageHeader } from "@/components/ui";
import { todayISO } from "@/lib/finance/dates";
import { NewReceivable } from "./NewReceivable";
import { ReceivablesTable, type RecvRowView } from "./ReceivablesTable";

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { profile } = await requireSession();
  const sp = await searchParams;
  const today = todayISO();
  const asPic = sp.as;
  const isSalesView = profile.role === "sales" || Boolean(asPic);

  const allRows = await getReceivableRows();
  const salesPics = await getSalesPics();

  const scoped = asPic ? allRows.filter((r) => r.receivable.sales_pic === asPic) : allRows;

  const rows: RecvRowView[] = scoped.map(({ receivable: r, summary }) => ({
    id: r.id,
    client: r.client_name,
    product: r.product,
    salesPic: r.sales_pic,
    dealAmount: r.total_receivable,
    paid: summary.totalPaid,
    outstanding: summary.outstanding,
    overdue: summary.overdueAmount,
    daysOverdue: summary.daysOverdue,
    nextDate: summary.nextDueDate,
    nextAmount: summary.nextDueAmount,
    collectionStatus: summary.collectionStatus,
    dealStatus: r.status,
    hrdc: r.hrdc_applicable,
    remarks: r.remarks,
  }));

  return (
    <div>
      <PageHeader
        title="Receivables"
        subtitle={isSalesView ? "Collection view — the deals assigned to you." : "Track every deal from schedule to collection."}
        actions={profile.role === "finance" && !asPic ? <NewReceivable salesPics={salesPics} /> : undefined}
      />

      {asPic && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span>Previewing what <strong>{asPic}</strong> sees in the Sales view.</span>
          <Link href="/receivables" className="font-medium underline">Exit preview</Link>
        </div>
      )}

      {profile.role === "finance" && !asPic && salesPics.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>View as Sales:</span>
          {salesPics.map((p) => (
            <Link key={p} href={`/receivables?as=${encodeURIComponent(p)}`} className="rounded-full border border-border bg-surface px-2.5 py-1 hover:bg-gray-50">
              {p}
            </Link>
          ))}
        </div>
      )}

      <ReceivablesTable
        rows={rows}
        today={today}
        isSalesView={isSalesView}
        salesPics={salesPics}
        showSalesPic={!isSalesView}
      />
    </div>
  );
}
