"use client";

// Amount field for the payable form. For a NEW payable, picking a payee +
// category that has a saved default (e.g. Nini / Petty Cash = RM1,500) fills
// the amount in — until you type your own. A tick-box saves the amount you
// enter as the default for that payee + category.

import { useEffect, useRef, useState } from "react";
import { Field, MoneyInput } from "@/components/form";
import { formatMYR } from "@/lib/finance/money";

export interface PayableDefaultAmount {
  payee: string;
  category_id: string | null;
  amount: number;
}

const norm = (s: string) => s.trim().toLowerCase();

function find(defaults: PayableDefaultAmount[], payee: string, category: string): PayableDefaultAmount | null {
  if (!norm(payee)) return null;
  return (
    defaults.find((d) => norm(d.payee) === norm(payee) && (d.category_id ?? "") === category) ??
    defaults.find((d) => norm(d.payee) === norm(payee) && !d.category_id) ??
    null
  );
}

export function AmountWithDefault({
  defaults,
  initialAmount,
  isNew,
}: {
  defaults: PayableDefaultAmount[];
  initialAmount?: number | string | null;
  isNew: boolean;
}) {
  const [value, setValue] = useState(initialAmount != null ? String(initialAmount) : "");
  const [touched, setTouched] = useState(!isNew || initialAmount != null);
  const [hint, setHint] = useState<string | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const touchedRef = useRef(touched);
  touchedRef.current = touched;

  useEffect(() => {
    const form = holder.current?.closest("form");
    if (!form || !isNew) return;
    function sync() {
      const payee = (form!.elements.namedItem("payee") as HTMLInputElement | null)?.value ?? "";
      const category = (form!.elements.namedItem("category_id") as HTMLInputElement | null)?.value ?? "";
      const d = find(defaults, payee, category);
      if (!d) return setHint(null);
      setHint(`Default for ${d.payee}: ${formatMYR(d.amount)}`);
      if (!touchedRef.current) setValue(String(d.amount));
    }
    form.addEventListener("input", sync);
    sync();
    return () => form.removeEventListener("input", sync);
  }, [defaults, isNew]);

  return (
    <div ref={holder}>
      <Field label="Amount" required>
        <MoneyInput
          name="amount"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setTouched(true);
          }}
          required
        />
      </Field>
      {hint && <p className="mt-1 text-xs text-emerald-700">{hint}</p>}
      <label className="mt-1.5 flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="save_default" value="1" className="h-3.5 w-3.5" />
        Remember this amount as the default for this payee + category
      </label>
    </div>
  );
}
