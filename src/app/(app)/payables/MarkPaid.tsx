"use client";

import { ComboSelect, DateWithToday, Field, FormDrawer, Input, MoneyInput } from "@/components/form";
import { formatMYR } from "@/lib/finance/money";
import { todayISO } from "@/lib/finance/dates";
import { owedAmount } from "@/lib/finance/payables";
import type { Payable, PaymentMethod } from "@/lib/types";
import { markPayablePaid } from "./actions";

/**
 * Record a payment / mark a payable paid. Shared by the payables table and the
 * Payment Priority List board so "Mark Paid" works from either place, with the
 * same partial-payment, settle-in-full and CIMB-deduction handling.
 */
export function MarkPaid({
  p,
  methods,
  triggerLabel,
  triggerVariant,
}: {
  p: Payable;
  methods: PaymentMethod[];
  triggerLabel?: string;
  triggerVariant?: "primary" | "secondary" | "danger";
}) {
  const remaining = owedAmount(p);
  const partial = p.status === "partially_paid";
  return (
    <FormDrawer
      triggerLabel={triggerLabel ?? (partial ? "Record Payment" : "Mark Paid")}
      triggerVariant={triggerVariant}
      title="Record Payment"
      description={`${p.payee} — ${formatMYR(remaining)} remaining${partial ? ` of ${formatMYR(p.amount)}` : ""}`}
      action={markPayablePaid}
      submitLabel="Save Payment"
    >
      <input type="hidden" name="id" value={p.id} />
      <Field label="Amount Paid Now" required hint="Enter the actual amount paid — it can differ from the estimate (e.g. USD rate or usage-based bills).">
        <MoneyInput name="paid_amount" defaultValue={remaining} required />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="settle_full" value="1" defaultChecked className="mt-0.5 h-4 w-4 rounded border-border" />
        <span>
          This fully settles the bill
          <span className="block text-xs text-muted">
            Marks it Paid and updates the amount to what you actually paid. Untick only for a genuine partial payment.
          </span>
        </span>
      </label>
      <Field label="Paid Date" required><DateWithToday name="paid_date" defaultValue={todayISO()} required /></Field>
      <Field label="Payment Method">
        <ComboSelect name="payment_method_id" defaultValue={p.payment_method_id ?? ""}>
          <option value="">—</option>
          {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </ComboSelect>
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="deduct_bank" value="1" defaultChecked className="mt-0.5 h-4 w-4 rounded border-border" />
        <span>
          Deduct from CIMB balance
          <span className="block text-xs text-muted">
            Applies only to <strong>CIMB Bank Transfer</strong> payments. Untick if you&apos;ve already updated the CIMB balance from the bank statement, so it isn&apos;t subtracted twice.
          </span>
        </span>
      </label>
      <Field label="Reference"><Input name="reference" /></Field>
    </FormDrawer>
  );
}
