import { getReceivableRows } from "./receivables";
import { getPayableRows } from "./payables";
import { getHrdcRows } from "./hrdc";
import { getBankAccounts } from "./refs";
import { buildMovements } from "./cashflow";
import { summarizeCashflow } from "@/lib/finance/cashflow";
import { owedAmount } from "@/lib/finance/payables";
import { sumMoney } from "@/lib/finance/money";
import { formatMYR } from "@/lib/finance/money";
import { daysUntil, endOfMonth, todayISO } from "@/lib/finance/dates";
import { sortAttention, type AttentionItem } from "@/lib/finance/attention";

export interface DashboardData {
  currentCash: number;
  projectedMonthEnd: number;
  recv: { outstanding: number; overdue: number; dueThisWeek: number; dueThisMonth: number };
  pay: { overdue: number; dueToday: number; due3: number; due7: number };
  hrdc: {
    awaitingGrant: number; trainingUpcoming: number; toSubmit: number; processing: number;
    fundsReceived: number; refundDue: number; refundsDue7: number; refundsOverdue: number; queriesOpen: number;
  };
  attention: AttentionItem[];
}

export async function getDashboardData(): Promise<DashboardData> {
  const today = todayISO();
  const month = today.slice(0, 7);

  const [recvRows, payRows, hrdcRows, banks, movements] = await Promise.all([
    getReceivableRows(),
    getPayableRows(),
    getHrdcRows(),
    getBankAccounts(),
    buildMovements(),
  ]);

  const currentCash = sumMoney(banks.filter((b) => b.active).map((b) => b.current_balance));
  const projectedMonthEnd = summarizeCashflow(movements, today, endOfMonth(today), currentCash).projectedClosing;

  // Receivables
  const recv = {
    outstanding: sumMoney(recvRows.map((r) => r.summary.outstanding)),
    overdue: sumMoney(recvRows.map((r) => r.summary.overdueAmount)),
    dueThisWeek: sumMoney(
      recvRows
        .filter((r) => r.summary.nextDueDate && r.summary.outstanding > 0 &&
          daysUntil(r.summary.nextDueDate, today) >= 0 && daysUntil(r.summary.nextDueDate, today) <= 7)
        .map((r) => r.summary.nextDueAmount),
    ),
    dueThisMonth: sumMoney(
      recvRows
        .filter((r) => r.summary.nextDueDate && r.summary.outstanding > 0 && r.summary.nextDueDate.slice(0, 7) === month)
        .map((r) => r.summary.nextDueAmount),
    ),
  };

  // Payables (unpaid + partially paid; amounts are what's still owed)
  const unpaid = payRows.filter((r) => r.payable.status === "unpaid" || r.payable.status === "partially_paid");
  const pay = {
    overdue: sumMoney(unpaid.filter((r) => r.attention.level === "overdue").map((r) => owedAmount(r.payable))),
    dueToday: sumMoney(unpaid.filter((r) => r.attention.level === "due_today").map((r) => owedAmount(r.payable))),
    due3: sumMoney(unpaid.filter((r) => r.attention.level === "due_3").map((r) => owedAmount(r.payable))),
    due7: sumMoney(unpaid.filter((r) => r.attention.level === "due_7").map((r) => owedAmount(r.payable))),
  };

  // HRDC
  const hrdc = {
    awaitingGrant: hrdcRows.filter((r) => r.tab === "application").length,
    trainingUpcoming: hrdcRows.filter((r) => r.tab === "training_upcoming").length,
    toSubmit: hrdcRows.filter((r) => r.tab === "claim_to_submit").length,
    processing: hrdcRows.filter((r) => r.tab === "processing").length,
    fundsReceived: sumMoney(hrdcRows.map((r) => r.claim.hrdc_amount_received ?? 0)),
    refundDue: sumMoney(hrdcRows.map((r) => r.refund.remaining)),
    refundsDue7: hrdcRows.filter((r) => r.refundAttn && r.refundAttn.days >= 0 && r.refundAttn.days <= 7).length,
    refundsOverdue: hrdcRows.filter((r) => r.refundAttn && r.refundAttn.days < 0).length,
    queriesOpen: hrdcRows.filter((r) => r.query.open).length,
  };

  // ---- Attention Required (auto-generated) ----
  const items: AttentionItem[] = [];

  for (const r of recvRows) {
    if (r.summary.overdueAmount > 0) {
      items.push({
        id: `recv-${r.receivable.id}`,
        severity: "high",
        module: "receivables",
        title: `${r.receivable.client_name} — ${formatMYR(r.summary.overdueAmount)} is ${r.summary.daysOverdue} day${r.summary.daysOverdue === 1 ? "" : "s"} overdue`,
        href: `/receivables/${r.receivable.id}`,
      });
    }
  }
  for (const r of unpaid) {
    const a = r.attention;
    if (a.level === "overdue" || a.level === "due_today" || a.level === "due_3") {
      items.push({
        id: `pay-${r.payable.id}`,
        severity: a.level === "overdue" ? "critical" : a.level === "due_today" ? "high" : "medium",
        module: "payables",
        title: `${r.payable.payee} ${formatMYR(owedAmount(r.payable))} — ${a.text.toLowerCase()}`,
        href: `/payables`,
      });
    }
  }
  if (hrdc.toSubmit > 0) {
    items.push({
      id: "hrdc-submit",
      severity: "high",
      module: "hrdc",
      title: `${hrdc.toSubmit} HRDC claim${hrdc.toSubmit === 1 ? "" : "s"} need submission`,
      href: "/hrdc?tab=claim_to_submit",
    });
  }
  for (const r of hrdcRows) {
    if (r.refundAttn && r.refundAttn.days <= 7) {
      items.push({
        id: `hrdc-refund-${r.claim.id}`,
        severity: r.refundAttn.days < 0 ? "critical" : "high",
        module: "hrdc",
        title: `HRDC refund for ${r.claim.client_name} — ${r.refundAttn.text.toLowerCase()}`,
        href: `/hrdc/${r.claim.id}`,
      });
    }
    if (r.query.open && r.query.days != null && r.query.days <= 3) {
      items.push({
        id: `hrdc-query-${r.claim.id}`,
        severity: r.query.days < 0 ? "critical" : "high",
        module: "hrdc",
        title: `${r.claim.client_name} — ${(r.query.text ?? "query").toLowerCase()}`,
        href: `/hrdc/${r.claim.id}`,
      });
    }
  }

  return { currentCash, projectedMonthEnd, recv, pay, hrdc, attention: sortAttention(items) };
}
