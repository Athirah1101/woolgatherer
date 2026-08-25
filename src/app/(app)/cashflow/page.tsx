import { requireRole } from "@/lib/auth";
import { buildMovements } from "@/lib/data/cashflow";
import { getBankAccounts } from "@/lib/data/refs";
import { filterMovements, summarizeCashflow, type CashCategory } from "@/lib/finance/cashflow";
import {
  Card, Chip, EmptyState, PageHeader, SummaryCard, Table, TBody, TD, TH, THead, TR, type Tone,
} from "@/components/ui";
import { formatMYR, sumMoney } from "@/lib/finance/money";
import { addMonths, endOfMonth, formatDate, startOfMonth, todayISO } from "@/lib/finance/dates";
import { PeriodPicker } from "./PeriodPicker";

function resolveRange(period: string, from?: string, to?: string) {
  const today = todayISO();
  switch (period) {
    case "next_month":
      return { start: startOfMonth(addMonths(today, 1)), end: endOfMonth(addMonths(today, 1)) };
    case "3_months":
      return { start: startOfMonth(today), end: endOfMonth(addMonths(today, 2)) };
    case "custom":
      return { start: from || startOfMonth(today), end: to || endOfMonth(today) };
    default:
      return { start: startOfMonth(today), end: endOfMonth(today) };
  }
}

const CAT_TONE: Record<CashCategory, Tone> = {
  receivable: "green",
  hrdc: "indigo",
  payable: "amber",
  expense: "orange",
  refund: "red",
};

export default async function CashflowPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole("finance", "management");
  const sp = await searchParams;
  const { start, end } = resolveRange(sp.period ?? "this_month", sp.from, sp.to);

  const [movements, banks] = await Promise.all([buildMovements(), getBankAccounts()]);
  const currentCash = sumMoney(banks.filter((b) => b.active).map((b) => b.current_balance));
  const summary = summarizeCashflow(movements, start, end, currentCash);
  const inWindow = filterMovements(movements, start, end);

  return (
    <div>
      <PageHeader
        title="Cashflow"
        subtitle={`${formatDate(start)} → ${formatDate(end)} · derived automatically from receivables, payables, expenses and HRDC.`}
      />
      <PeriodPicker />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Starting / Current Cash" value={formatMYR(summary.currentCash)} />
        <SummaryCard label="Expected Cash In" value={formatMYR(summary.expectedIn)} tone="green" />
        <SummaryCard label="Expected Cash Out" value={formatMYR(summary.expectedOut)} tone="amber" />
        <SummaryCard
          label="Projected Closing Cash"
          value={formatMYR(summary.projectedClosing)}
          tone={summary.projectedClosing >= summary.currentCash ? "green" : "red"}
          sub="Current + Expected In − Expected Out"
        />
      </div>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <SummaryCard label="Actual Cash In (recorded)" value={formatMYR(summary.actualIn)} tone="green" />
        <SummaryCard label="Actual Cash Out (recorded)" value={formatMYR(summary.actualOut)} tone="orange" />
        <SummaryCard
          label="Net Actual Movement"
          value={formatMYR(summary.netActual)}
          tone={summary.netActual >= 0 ? "green" : "red"}
        />
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        Movement Timeline
      </h2>
      {inWindow.length === 0 ? (
        <EmptyState
          title="No cash movements in this period."
          message="Scheduled receipts, payables, expenses and HRDC refunds will appear here as their dates fall in range."
        />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <TR>
                <TH>Date</TH><TH>Item</TH><TH>Type</TH><TH>Basis</TH><TH right>In</TH><TH right>Out</TH>
              </TR>
            </THead>
            <TBody>
              {inWindow.map((m, i) => (
                <TR key={i}>
                  <TD className="whitespace-nowrap">{formatDate(m.date)}</TD>
                  <TD className="font-medium">{m.label}</TD>
                  <TD><Chip tone={CAT_TONE[m.category]}>{m.category}</Chip></TD>
                  <TD>
                    <Chip tone={m.actual ? "green" : "gray"}>{m.actual ? "Actual" : "Expected"}</Chip>
                  </TD>
                  <TD right className={m.direction === "in" ? "font-medium text-emerald-700" : "text-muted"}>
                    {m.direction === "in" ? formatMYR(m.amount) : "—"}
                  </TD>
                  <TD right className={m.direction === "out" ? "font-medium text-red-600" : "text-muted"}>
                    {m.direction === "out" ? formatMYR(m.amount) : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
