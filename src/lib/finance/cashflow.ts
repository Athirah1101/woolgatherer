// Cashflow aggregation from operational records. Expected vs actual, no double
// counting: "expected" movements are only ever the *unsettled* portion
// (outstanding schedules, unpaid payables, remaining refund obligations), while
// "actual" movements are recorded transactions.

import { diffDays } from "./dates";
import { sumMoney } from "./money";

export type CashCategory = "receivable" | "hrdc" | "payable" | "expense" | "refund";

export interface CashMovement {
  date: string; // ISO date the cash moves / is expected to move
  direction: "in" | "out";
  actual: boolean; // true = recorded, false = expected/forecast
  amount: number;
  label: string;
  category: CashCategory;
  refType?: string;
  refId?: string;
}

export interface CashflowSummary {
  startingCash: number;
  expectedIn: number;
  expectedOut: number;
  projectedClosing: number;
  actualIn: number;
  actualOut: number;
  netActual: number;
  currentCash: number;
}

function inRange(date: string, start: string, end: string): boolean {
  return diffDays(start, date) >= 0 && diffDays(date, end) >= 0;
}

export function filterMovements(
  movements: CashMovement[],
  start: string,
  end: string,
): CashMovement[] {
  return movements
    .filter((m) => inRange(m.date, start, end))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function summarizeCashflow(
  movements: CashMovement[],
  start: string,
  end: string,
  currentCash: number,
): CashflowSummary {
  const inWindow = filterMovements(movements, start, end);
  const expectedIn = sumMoney(
    inWindow.filter((m) => !m.actual && m.direction === "in").map((m) => m.amount),
  );
  const expectedOut = sumMoney(
    inWindow.filter((m) => !m.actual && m.direction === "out").map((m) => m.amount),
  );
  const actualIn = sumMoney(
    inWindow.filter((m) => m.actual && m.direction === "in").map((m) => m.amount),
  );
  const actualOut = sumMoney(
    inWindow.filter((m) => m.actual && m.direction === "out").map((m) => m.amount),
  );

  return {
    startingCash: currentCash,
    expectedIn,
    expectedOut,
    projectedClosing: sumMoney([currentCash, expectedIn, -expectedOut]),
    actualIn,
    actualOut,
    netActual: sumMoney([actualIn, -actualOut]),
    currentCash,
  };
}
