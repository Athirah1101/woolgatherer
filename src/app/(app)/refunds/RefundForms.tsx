"use client";

import { FormDrawer, Field, Input, MoneyInput, Textarea, DateWithToday } from "@/components/form";
import { Select } from "@/components/form";
import { saveRefundCase } from "./actions";
import { recordRefund } from "../hrdc/actions";
import type { PaymentMethod } from "@/lib/types";

interface CaseDefaults {
  id?: string;
  client_name?: string;
  notes?: string | null;
  amount_client_paid?: number | null;
  claim_amount?: number | null;
  hrdc_received_date?: string | null;
  hrdc_amount_received?: number | null;
  refund_amount_due?: number | null;
}

function num(v: number | null | undefined): string | undefined {
  return v == null ? undefined : String(v);
}

/** New / Edit a refund case (client name, notes, amounts, HRDC received). */
export function RefundCaseForm({
  defaults,
  trigger,
}: {
  defaults?: CaseDefaults;
  trigger: React.ReactNode;
}) {
  const isEdit = Boolean(defaults?.id);
  return (
    <FormDrawer
      triggerLabel={trigger}
      triggerVariant={isEdit ? "secondary" : "primary"}
      title={isEdit ? "Edit Refund Case" : "New Refund Case"}
      description="Track a client refund arising from an HRDC claim."
      action={saveRefundCase}
      submitLabel={isEdit ? "Save Changes" : "Create Case"}
    >
      {defaults?.id && <input type="hidden" name="id" value={defaults.id} />}
      <Field label="Client Name" required>
        <Input name="client_name" defaultValue={defaults?.client_name ?? ""} required />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Amount They Paid" hint="What the client paid us up front.">
          <MoneyInput name="amount_client_paid" defaultValue={num(defaults?.amount_client_paid)} />
        </Field>
        <Field label="Amount They Claimed" hint="The HRDC claim amount.">
          <MoneyInput name="claim_amount" defaultValue={num(defaults?.claim_amount)} />
        </Field>
      </div>
      <Field
        label="Date HRDF Amount Received"
        hint="Leave blank until HRD Corp funds arrive — this starts the 30-day refund clock."
      >
        <DateWithToday name="hrdc_received_date" defaultValue={defaults?.hrdc_received_date ?? ""} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="HRDF Amount Received" hint="Defaults to the claim amount.">
          <MoneyInput name="hrdc_amount_received" defaultValue={num(defaults?.hrdc_amount_received)} />
        </Field>
        <Field label="Refund Due to Client" hint="Defaults to the claim amount.">
          <MoneyInput name="refund_amount_due" defaultValue={num(defaults?.refund_amount_due)} />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea name="notes" defaultValue={defaults?.notes ?? ""} />
      </Field>
    </FormDrawer>
  );
}

/** Record a (possibly partial) refund payment back to the client. */
export function RecordRefundForm({
  claimId,
  methods,
  trigger,
}: {
  claimId: string;
  methods: PaymentMethod[];
  trigger: React.ReactNode;
}) {
  return (
    <FormDrawer
      triggerLabel={trigger}
      triggerVariant="secondary"
      title="Record Refund"
      description="Log money paid back to the client (partial refunds are supported)."
      action={recordRefund}
      submitLabel="Record Refund"
    >
      <input type="hidden" name="claim_id" value={claimId} />
      <Field label="Refund Amount" required>
        <MoneyInput name="amount" required />
      </Field>
      <Field label="Refund Date">
        <DateWithToday name="refund_date" />
      </Field>
      <Field label="Paid Via">
        <Select name="payment_method_id" defaultValue="">
          <option value="">—</option>
          {methods.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Reference">
        <Input name="reference" placeholder="Transaction / receipt no." />
      </Field>
      <Field label="Notes">
        <Textarea name="notes" />
      </Field>
    </FormDrawer>
  );
}
