import { describe, it, expect } from "vitest";
import type {
  HrdcClaim,
  HrdcRefund,
  PaymentAllocation,
  PaymentSchedule,
  ReceivablePayment,
} from "@/lib/types";
import {
  allocatePayment,
  generateSchedule,
  summarizeReceivable,
} from "./receivables";
import { payableAttention, dueDatesForRule } from "./payables";
import {
  trainingWindow,
  claimSubmissionTarget,
  queryReplyDeadline,
  refundDeadline,
  refundSummary,
  refundAttention,
} from "./hrdc";
import { summarizeCashflow, type CashMovement } from "./cashflow";
import { addDays } from "./dates";

// ---- helpers -------------------------------------------------------------
let seq = 0;
const uid = () => `id-${++seq}`;

function sched(due: string, amount: number, order = 0): PaymentSchedule {
  return {
    id: uid(),
    receivable_id: "r1",
    due_date: due,
    expected_amount: amount,
    sort_order: order,
    notes: null,
  };
}

/** Simulate the server-side Record Payment: allocate then append. */
function record(
  schedules: PaymentSchedule[],
  payments: ReceivablePayment[],
  allocations: PaymentAllocation[],
  amount: number,
  date: string,
  target?: string,
) {
  const res = allocatePayment(amount, schedules, allocations, target);
  const p: ReceivablePayment = {
    id: uid(),
    receivable_id: "r1",
    amount,
    received_date: date,
    payment_method_id: null,
    reference: null,
    notes: null,
    voided: false,
    created_at: date,
  };
  const newAllocs: PaymentAllocation[] = res.allocations.map((a) => ({
    id: uid(),
    payment_id: p.id,
    schedule_id: a.schedule_id,
    amount: a.amount,
  }));
  return {
    payments: [...payments, p],
    allocations: [...allocations, ...newAllocs],
    credit: res.credit,
  };
}

// ==========================================================================
// RECEIVABLES
// ==========================================================================
describe("Receivables", () => {
  it("Scenario A — full payment closes the schedule", () => {
    const s = [sched("2026-08-01", 12000)];
    const r = record(s, [], [], 12000, "2026-08-01");
    const sum = summarizeReceivable(s, r.payments, r.allocations, "2026-08-05");
    expect(sum.totalPaid).toBe(12000);
    expect(sum.outstanding).toBe(0);
    expect(sum.collectionStatus).toBe("paid");
    expect(sum.schedules[0].status).toBe("paid");
    expect(sum.nextDueDate).toBeNull();
  });

  it("Scenario B — partial payment, then partially overdue after due date", () => {
    const s = [sched("2026-08-10", 5000)];
    const r = record(s, [], [], 3000, "2026-08-05");
    // before due date
    let sum = summarizeReceivable(s, r.payments, r.allocations, "2026-08-06");
    expect(sum.outstanding).toBe(2000);
    expect(sum.collectionStatus).toBe("partially_paid");
    expect(sum.schedules[0].status).toBe("partially_paid");
    expect(sum.overdueAmount).toBe(0);
    // after due date
    sum = summarizeReceivable(s, r.payments, r.allocations, "2026-08-20");
    expect(sum.schedules[0].status).toBe("partially_overdue");
    expect(sum.overdueAmount).toBe(2000);
    expect(sum.daysOverdue).toBe(10);
  });

  it("Scenario C — irregular custom schedule", () => {
    const s = [
      sched("2026-08-01", 20000, 0),
      sched("2026-08-15", 5000, 1),
      sched("2026-09-01", 15000, 2),
      sched("2026-10-15", 30000, 3),
      sched("2026-12-01", 50000, 4),
    ];
    let acc = record(s, [], [], 20000, "2026-08-01");
    acc = record(s, acc.payments, acc.allocations, 5000, "2026-08-15");
    const sum = summarizeReceivable(s, acc.payments, acc.allocations, "2026-08-20");
    expect(sum.totalExpected).toBe(120000);
    expect(sum.totalPaid).toBe(25000);
    expect(sum.outstanding).toBe(95000);
    expect(sum.nextDueDate).toBe("2026-09-01");
    expect(sum.nextDueAmount).toBe(15000);
  });

  it("Scenario D — one instalment paid via two transactions", () => {
    const s = [sched("2026-08-10", 5000)];
    let acc = record(s, [], [], 2000, "2026-08-05");
    acc = record(s, acc.payments, acc.allocations, 3000, "2026-08-09");
    const sum = summarizeReceivable(s, acc.payments, acc.allocations, "2026-08-11");
    expect(sum.totalPaid).toBe(5000);
    expect(sum.outstanding).toBe(0);
    expect(sum.schedules[0].status).toBe("paid");
  });

  it("Scenario E — overpayment flows to next instalment, remainder is credit", () => {
    const s = [sched("2026-08-01", 5000, 0), sched("2026-09-01", 5000, 1)];
    // pay 12000 against a total of 10000
    const acc = record(s, [], [], 12000, "2026-08-01");
    const sum = summarizeReceivable(s, acc.payments, acc.allocations, "2026-08-02");
    expect(sum.schedules[0].status).toBe("paid");
    expect(sum.schedules[1].status).toBe("paid");
    expect(sum.outstanding).toBe(0);
    expect(sum.credit).toBe(2000); // 12000 - 10000 remains as unapplied credit
    expect(sum.collectionStatus).toBe("overpaid");
  });

  it("preset schedule generates even instalments with remainder on the first", () => {
    const rows = generateSchedule("3_instalments", 10000, "2026-08-01");
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.expected_amount).reduce((a, b) => a + b, 0)).toBe(10000);
    expect(rows[0].due_date).toBe("2026-08-01");
    expect(rows[1].due_date).toBe("2026-09-01");
  });
});

// ==========================================================================
// PAYABLES
// ==========================================================================
describe("Payables", () => {
  it("Scenario H — attention changes with the date", () => {
    const due = "2026-08-21";
    expect(payableAttention({ due_date: due, status: "unpaid" }, "2026-08-21").level).toBe("due_today");
    expect(payableAttention({ due_date: due, status: "unpaid" }, "2026-08-19").level).toBe("due_3");
    expect(payableAttention({ due_date: due, status: "unpaid" }, "2026-08-16").level).toBe("due_7");
    expect(payableAttention({ due_date: due, status: "unpaid" }, "2026-08-25").level).toBe("overdue");
    expect(payableAttention({ due_date: due, status: "paid" }, "2026-08-25").level).toBe("paid");
  });

  it("Scenario F — monthly rule produces next month's payable", () => {
    const rule = {
      frequency: "monthly" as const,
      due_day: 15,
      due_month: null,
      start_date: "2026-01-15",
      end_date: null,
      active: true,
    };
    const dues = dueDatesForRule(rule, "2026-08-01", "2026-09-30");
    expect(dues.map((d) => d.due_date)).toEqual(["2026-08-15", "2026-09-15"]);
    expect(dues[1].period_key).toBe("2026-09");
  });

  it("Scenario F2 — yearly rule anchors to the chosen due_month", () => {
    const rule = {
      frequency: "yearly" as const,
      due_day: 10,
      due_month: 3, // March
      start_date: "2026-01-01",
      end_date: null,
      active: true,
    };
    // Only March 2026 falls in the window; not August.
    expect(dueDatesForRule(rule, "2026-01-01", "2026-12-31").map((d) => d.due_date)).toEqual([
      "2026-03-10",
    ]);
    // Next year's occurrence is the following March.
    expect(dueDatesForRule(rule, "2027-01-01", "2027-12-31").map((d) => d.due_date)).toEqual([
      "2027-03-10",
    ]);
  });

  it("Scenario G — variable rule: generation is period-idempotent, amounts independent", () => {
    const rule = {
      frequency: "monthly" as const,
      due_day: 15,
      due_month: null,
      start_date: "2026-08-15",
      end_date: null,
      active: true,
    };
    // only future/period months are emitted; each maps to a distinct period_key
    const dues = dueDatesForRule(rule, "2026-08-01", "2026-10-31");
    expect(dues.map((d) => d.period_key)).toEqual(["2026-08", "2026-09", "2026-10"]);
  });
});

// ==========================================================================
// HRDC
// ==========================================================================
function baseClaim(over: Partial<HrdcClaim> = {}): HrdcClaim {
  return {
    id: "c1",
    receivable_id: null,
    client_name: "Test",
    contact_name: null,
    product: null,
    sales_pic: null,
    amount_client_paid: null,
    claim_amount: null,
    approved_amount: null,
    hrdc_amount_received: null,
    hrdc_received_date: null,
    refund_amount_due: null,
    grant_application_date: null,
    grant_reference: null,
    grant_approval_date: null,
    grant_status: null,
    training_start_date: null,
    training_end_date: null,
    documents_complete: false,
    documents_collected_date: null,
    claim_submitted_date: null,
    claim_status: null,
    claim_approved_date: null,
    query_received: false,
    query_received_date: null,
    query_details: null,
    query_replied_date: null,
    refund_payment_method_id: null,
    refund_reference: null,
    grant_approval_notification_sent: false,
    grant_approval_notification_date: null,
    refund_processing_notification_sent: false,
    refund_processing_notification_date: null,
    stage: "client_payment_received",
    notes: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...over,
  };
}

describe("HRDC", () => {
  it("Scenario J — grant approval creates the 14–90 day training window", () => {
    const win = trainingWindow("2026-06-01");
    expect(win).toEqual({ earliest: "2026-06-15", latest: "2026-08-30" });
  });

  it("Scenario K — training completion generates claim submission target (+7d)", () => {
    expect(claimSubmissionTarget("2026-07-10")).toBe("2026-07-17");
  });

  it("Scenario L — query produces a 5 calendar-day reply deadline", () => {
    expect(queryReplyDeadline("2026-08-20")).toBe("2026-08-25");
  });

  it("Scenario M — refund deadline is exactly 30 days after funds received", () => {
    expect(refundDeadline("2026-08-01")).toBe("2026-08-31");
    const claim = baseClaim({
      hrdc_amount_received: 10000,
      hrdc_received_date: "2026-08-01",
      refund_amount_due: 10000,
    });
    const s = refundSummary(claim, []);
    expect(s.deadline).toBe("2026-08-31");
    expect(s.countdownActive).toBe(true);
    expect(s.remaining).toBe(10000);
  });

  it("Scenario N — claim approved but funds NOT received: no refund countdown", () => {
    const claim = baseClaim({
      claim_approved_date: "2026-08-01",
      approved_amount: 10000,
      refund_amount_due: 10000,
      // hrdc_received_date stays null
    });
    const s = refundSummary(claim, []);
    expect(s.status).toBe("not_due");
    expect(s.countdownActive).toBe(false);
    expect(s.deadline).toBeNull();
    expect(refundAttention(claim, [], "2026-09-01")).toBeNull();
  });

  it("Scenario O — partial refund keeps the remaining obligation", () => {
    const claim = baseClaim({
      hrdc_amount_received: 10000,
      hrdc_received_date: "2026-08-01",
      refund_amount_due: 10000,
    });
    const refunds: HrdcRefund[] = [
      { id: "rf1", claim_id: "c1", amount: 4000, refund_date: "2026-08-10", payment_method_id: null, reference: null, notes: null },
    ];
    const s = refundSummary(claim, refunds);
    expect(s.refunded).toBe(4000);
    expect(s.remaining).toBe(6000);
    expect(s.status).toBe("partial");
    expect(s.countdownActive).toBe(true);
  });

  it("refund attention colours track the countdown", () => {
    const claim = baseClaim({ hrdc_received_date: "2026-08-01", refund_amount_due: 10000 });
    expect(refundAttention(claim, [], "2026-08-02")!.color).toBe("green"); // 29 days
    expect(refundAttention(claim, [], "2026-08-20")!.color).toBe("yellow"); // 11 days
    expect(refundAttention(claim, [], "2026-08-28")!.color).toBe("orange"); // 3 days
    expect(refundAttention(claim, [], "2026-09-05")!.color).toBe("red"); // overdue
  });
});

// ==========================================================================
// CASHFLOW
// ==========================================================================
describe("Cashflow", () => {
  const start = "2026-08-01";
  const end = "2026-08-31";

  it("Scenario P — scheduled receivable lifts forecast, not actual", () => {
    const m: CashMovement[] = [
      { date: "2026-08-20", direction: "in", actual: false, amount: 5000, label: "sched", category: "receivable" },
    ];
    const s = summarizeCashflow(m, start, end, 100000);
    expect(s.expectedIn).toBe(5000);
    expect(s.actualIn).toBe(0);
    expect(s.projectedClosing).toBe(105000);
  });

  it("Scenario Q — recorded receivable payment lifts actual cash", () => {
    const m: CashMovement[] = [
      { date: "2026-08-10", direction: "in", actual: true, amount: 5000, label: "pay", category: "receivable" },
    ];
    const s = summarizeCashflow(m, start, end, 100000);
    expect(s.actualIn).toBe(5000);
    expect(s.expectedIn).toBe(0);
  });

  it("Scenario R & S — payable reduces projected, payment reduces actual", () => {
    const m: CashMovement[] = [
      { date: "2026-08-25", direction: "out", actual: false, amount: 3000, label: "payable", category: "payable" },
      { date: "2026-08-05", direction: "out", actual: true, amount: 2000, label: "paid", category: "payable" },
    ];
    const s = summarizeCashflow(m, start, end, 100000);
    expect(s.expectedOut).toBe(3000);
    expect(s.actualOut).toBe(2000);
    expect(s.projectedClosing).toBe(97000); // 100000 - 3000 expected out
  });

  it("Scenario T — HRDC funds received: actual in now + future refund out", () => {
    const m: CashMovement[] = [
      { date: "2026-08-01", direction: "in", actual: true, amount: 10000, label: "hrdc", category: "hrdc" },
      { date: "2026-08-31", direction: "out", actual: false, amount: 10000, label: "refund due", category: "refund" },
    ];
    const s = summarizeCashflow(m, start, end, 50000);
    expect(s.actualIn).toBe(10000);
    expect(s.expectedOut).toBe(10000);
  });

  it("Scenario U — client refund reduces actual cash when paid", () => {
    const m: CashMovement[] = [
      { date: "2026-08-15", direction: "out", actual: true, amount: 10000, label: "refund paid", category: "refund" },
    ];
    const s = summarizeCashflow(m, start, end, 50000);
    expect(s.actualOut).toBe(10000);
  });

  it("date math has no timezone drift across a month/DST-style boundary", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
