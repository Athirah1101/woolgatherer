"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { DateWithToday, Field, Input, MoneyInput, SubmitButton, Textarea } from "@/components/form";
import { createHrdcClaim } from "./actions";

export interface HrdcDefaults {
  receivable_id?: string;
  client_name?: string;
  product?: string;
  sales_pic?: string;
  contact_name?: string;
  amount_client_paid?: number;
}

export function NewHrdcForm({ defaults }: { defaults: HrdcDefaults }) {
  const router = useRouter();
  const [state, formAction] = useActionState(createHrdcClaim, null);

  useEffect(() => {
    if (state?.ok) router.push("/hrdc");
  }, [state, router]);

  return (
    <Card className="max-w-2xl">
      <form action={formAction} className="flex flex-col gap-4">
        {defaults.receivable_id && (
          <input type="hidden" name="receivable_id" value={defaults.receivable_id} />
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Client / Company" required>
            <Input name="client_name" defaultValue={defaults.client_name} required />
          </Field>
          <Field label="Contact Name">
            <Input name="contact_name" defaultValue={defaults.contact_name} />
          </Field>
          <Field label="Product / Program">
            <Input name="product" defaultValue={defaults.product} />
          </Field>
          <Field label="Sales PIC">
            <Input name="sales_pic" defaultValue={defaults.sales_pic} />
          </Field>
          <Field label="Amount Client Paid">
            <MoneyInput name="amount_client_paid" defaultValue={defaults.amount_client_paid} />
          </Field>
          <Field label="HRDC Claim Amount">
            <MoneyInput name="claim_amount" />
          </Field>
          <Field label="Grant Application Date">
            <DateWithToday name="grant_application_date" />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea name="notes" />
        </Field>
        {state?.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <SubmitButton>Create Claim</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
