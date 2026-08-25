import { createClient } from "@/lib/supabase/server";
import type { CashMovement } from "@/lib/finance/cashflow";
import type { Payable, ReceivablePayment } from "@/lib/types";
import { getReceivableRows } from "./receivables";
import { getHrdcRows } from "./hrdc";
import { addDays } from "@/lib/finance/dates";
import { subMoney } from "@/lib/finance/money";

const HRDC_ESTIMATE_DAYS = 49; // ~7 weeks processing estimate (forecast only)

/**
 * Build the full set of cash movements from operational records.
 * "expected" = unsettled (schedule outstanding, unpaid payables/expenses,
 * remaining refund obligations). "actual" = recorded transactions.
 * Designed to avoid double counting: settled items never appear as expected.
 */
export async function buildMovements(): Promise<CashMovement[]> {
  const supabase = await createClient();
  const movements: CashMovement[] = [];

  // --- Receivables: expected in (schedule outstanding) + actual in (payments)
  const rows = await getReceivableRows();
  for (const { receivable, summary } of rows) {
    for (const sch of summary.schedules) {
      if (sch.outstanding > 0) {
        movements.push({
          date: sch.due_date,
          direction: "in",
          actual: false,
          amount: sch.outstanding,
          label: `${receivable.client_name} — scheduled`,
          category: "receivable",
          refType: "receivable",
          refId: receivable.id,
        });
      }
    }
  }
  const { data: payments } = await supabase
    .from("receivable_payments")
    .select("*")
    .eq("voided", false);
  const recvName = new Map(rows.map((r) => [r.receivable.id, r.receivable.client_name]));
  for (const p of (payments ?? []) as ReceivablePayment[]) {
    movements.push({
      date: p.received_date,
      direction: "in",
      actual: true,
      amount: p.amount,
      label: `${recvName.get(p.receivable_id) ?? "Receivable"} — payment`,
      category: "receivable",
      refType: "receivable",
      refId: p.receivable_id,
    });
  }

  // --- HRDC: funds received (actual in), refund obligation (expected out),
  //     refunds paid (actual out), estimated inflow (forecast in)
  const hrdcRows = await getHrdcRows();
  for (const r of hrdcRows) {
    const c = r.claim;
    if (c.hrdc_received_date && c.hrdc_amount_received) {
      movements.push({
        date: c.hrdc_received_date, direction: "in", actual: true,
        amount: c.hrdc_amount_received, label: `${c.client_name} — HRDC funds`,
        category: "hrdc", refType: "hrdc", refId: c.id,
      });
    } else if (c.claim_submitted_date && (c.approved_amount || c.claim_amount)) {
      // forecast HRDC inflow ~7 weeks after submission (estimate only)
      movements.push({
        date: addDays(c.claim_submitted_date, HRDC_ESTIMATE_DAYS),
        direction: "in", actual: false,
        amount: c.approved_amount ?? c.claim_amount ?? 0,
        label: `${c.client_name} — HRDC (estimated)`,
        category: "hrdc", refType: "hrdc", refId: c.id,
      });
    }
    if (r.refund.countdownActive && r.refund.deadline) {
      movements.push({
        date: r.refund.deadline, direction: "out", actual: false,
        amount: r.refund.remaining, label: `${c.client_name} — refund due`,
        category: "refund", refType: "hrdc", refId: c.id,
      });
    }
    for (const rf of r.refunds) {
      movements.push({
        date: rf.refund_date, direction: "out", actual: true,
        amount: rf.amount, label: `${c.client_name} — refund paid`,
        category: "refund", refType: "hrdc", refId: c.id,
      });
    }
  }

  // --- Payables
  const { data: payables } = await supabase.from("payables").select("*");
  for (const p of (payables ?? []) as Payable[]) {
    if (p.status === "unpaid") {
      movements.push({
        date: p.due_date, direction: "out", actual: false, amount: p.amount,
        label: `${p.payee} — payable`, category: "payable", refType: "payable", refId: p.id,
      });
    } else if (p.status === "partially_paid") {
      // Actual out for what's been paid, plus expected out for the remainder.
      const paid = p.paid_amount ?? 0;
      const remaining = Math.max(0, subMoney(p.amount, paid));
      if (paid > 0 && p.paid_date)
        movements.push({
          date: p.paid_date, direction: "out", actual: true, amount: paid,
          label: `${p.payee} — part paid`, category: "payable", refType: "payable", refId: p.id,
        });
      if (remaining > 0)
        movements.push({
          date: p.due_date, direction: "out", actual: false, amount: remaining,
          label: `${p.payee} — payable (balance)`, category: "payable", refType: "payable", refId: p.id,
        });
    } else if (p.status === "paid" && p.paid_date) {
      movements.push({
        date: p.paid_date, direction: "out", actual: true, amount: p.paid_amount ?? p.amount,
        label: `${p.payee} — paid`, category: "payable", refType: "payable", refId: p.id,
      });
    }
  }

  return movements;
}
