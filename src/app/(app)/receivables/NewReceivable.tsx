"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { buttonClass } from "@/components/ui";
import { Field, Input, MoneyInput, Select, SubmitButton, Textarea } from "@/components/form";
import {
  generateSchedule,
  PAYMENT_PLAN_OPTIONS,
} from "@/lib/finance/receivables";
import { formatMYR, sumMoney } from "@/lib/finance/money";
import { todayISO } from "@/lib/finance/dates";
import { createReceivable } from "./actions";

interface Row {
  due_date: string;
  expected_amount: string;
}

export function NewReceivable({ salesPics }: { salesPics: string[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createReceivable, null);

  const [plan, setPlan] = useState("full");
  const [total, setTotal] = useState("");
  const [start, setStart] = useState(todayISO());
  const [rows, setRows] = useState<Row[]>([{ due_date: todayISO(), expected_amount: "" }]);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  function regenerate() {
    if (plan === "custom") return;
    const generated = generateSchedule(plan, Number(total) || 0, start);
    setRows(generated.map((g) => ({ due_date: g.due_date, expected_amount: String(g.expected_amount) })));
  }

  const scheduleJson = useMemo(
    () =>
      JSON.stringify(
        rows
          .filter((r) => r.due_date && Number(r.expected_amount) > 0)
          .map((r) => ({ due_date: r.due_date, expected_amount: Number(r.expected_amount) })),
      ),
    [rows],
  );
  const scheduleTotal = useMemo(
    () => sumMoney(rows.map((r) => Number(r.expected_amount) || 0)),
    [rows],
  );

  return (
    <>
      <button className={buttonClass("primary")} onClick={() => setOpen(true)}>
        + New Receivable
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-surface shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-6 py-4">
              <h2 className="text-lg font-semibold">New Receivable</h2>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-muted hover:bg-gray-100">✕</button>
            </div>
            <form action={formAction} className="flex flex-1 flex-col gap-4 px-6 py-5">
              <input type="hidden" name="schedule" value={scheduleJson} />
              <input type="hidden" name="payment_plan_type" value={plan} />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Client / Company" required>
                  <Input name="client_name" required />
                </Field>
                <Field label="Contact Name">
                  <Input name="contact_name" />
                </Field>
                <Field label="Product / Program">
                  <Input name="product" />
                </Field>
                <Field label="Sales PIC">
                  <Input name="sales_pic" list="sales-pics" placeholder="Assign a salesperson" />
                  <datalist id="sales-pics">
                    {salesPics.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Deal Date">
                  <Input type="date" name="deal_date" defaultValue={todayISO()} />
                </Field>
                <Field label="Original Deal Amount" required>
                  <MoneyInput
                    name="original_amount"
                    value={total}
                    onChange={(e) => setTotal(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Total Receivable" hint="Defaults to the deal amount.">
                  <MoneyInput name="total_receivable" defaultValue={total} key={total} />
                </Field>
                <Field label="HRDC Applicable?">
                  <label className="flex items-center gap-2 py-2 text-sm">
                    <input type="checkbox" name="hrdc_applicable" className="h-4 w-4" />
                    Yes — an HRDC claim can be linked later
                  </label>
                </Field>
              </div>

              {/* Schedule builder */}
              <div className="rounded-xl border border-border bg-gray-50/60 p-4">
                <div className="mb-3 flex flex-wrap items-end gap-3">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">Payment Plan</span>
                    <Select value={plan} onChange={(e) => setPlan(e.target.value)} className="bg-surface">
                      {PAYMENT_PLAN_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  </label>
                  {plan !== "custom" && (
                    <label className="text-sm">
                      <span className="mb-1 block font-medium">First Due Date</span>
                      <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="bg-surface" />
                    </label>
                  )}
                  <button type="button" className={buttonClass("secondary")} onClick={regenerate}>
                    {plan === "custom" ? "Custom — add rows below" : "Generate instalments"}
                  </button>
                </div>

                <div className="space-y-2">
                  {rows.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={r.due_date}
                        onChange={(e) =>
                          setRows((rs) => rs.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))
                        }
                        className="bg-surface"
                      />
                      <MoneyInput
                        value={r.expected_amount}
                        onChange={(e) =>
                          setRows((rs) => rs.map((x, j) => (j === i ? { ...x, expected_amount: e.target.value } : x)))
                        }
                        className="bg-surface"
                      />
                      <button
                        type="button"
                        onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                        className="rounded-md px-2 py-2 text-muted hover:bg-gray-200"
                        aria-label="Remove instalment"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    className="text-sm font-medium text-brand hover:underline"
                    onClick={() => setRows((rs) => [...rs, { due_date: todayISO(), expected_amount: "" }])}
                  >
                    + Add instalment
                  </button>
                  <span className="text-sm text-muted">
                    Schedule total: <span className="font-semibold text-text">{formatMYR(scheduleTotal)}</span>
                  </span>
                </div>
              </div>

              <Field label="Remarks">
                <Input name="remarks" placeholder="Short note shown in the table" />
              </Field>
              <Field label="Notes">
                <Textarea name="notes" />
              </Field>

              {state?.error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
              )}
              <div className="mt-2 flex justify-end gap-2 border-t border-border pt-4">
                <button type="button" onClick={() => setOpen(false)} className={buttonClass("secondary")}>
                  Cancel
                </button>
                <SubmitButton>Create Receivable</SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
