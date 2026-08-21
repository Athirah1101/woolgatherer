"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/form";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Frequency + Due Day, plus a Month picker that appears only for yearly and
 * quarterly rules (where the cycle needs to know which month it anchors to).
 */
export function FrequencyFields({
  defaultFrequency = "monthly",
  defaultDueDay = 1,
  defaultDueMonth,
}: {
  defaultFrequency?: string;
  defaultDueDay?: number;
  defaultDueMonth?: number | null;
}) {
  const [frequency, setFrequency] = useState(defaultFrequency);
  const showMonth = frequency === "yearly" || frequency === "quarterly";

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Frequency">
          <Select name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </Field>
        <Field label="Due Day (of month)">
          <Input type="number" name="due_day" min={1} max={31} defaultValue={defaultDueDay} />
        </Field>
      </div>
      {showMonth && (
        <Field
          label={frequency === "yearly" ? "Month" : "Starting Month"}
          hint={
            frequency === "yearly"
              ? "Which month of the year this payment is due."
              : "The first month of the quarterly cycle (then every 3 months)."
          }
        >
          <Select name="due_month" defaultValue={defaultDueMonth ? String(defaultDueMonth) : ""}>
            <option value="">—</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </Select>
        </Field>
      )}
    </>
  );
}
