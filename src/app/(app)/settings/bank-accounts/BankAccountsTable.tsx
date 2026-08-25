"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, Chip } from "@/components/ui";
import { DateWithToday, Field, FormDrawer, Input, MoneyInput, Select } from "@/components/form";
import { formatMYR } from "@/lib/finance/money";
import { formatDate, todayISO } from "@/lib/finance/dates";
import type { BankAccount } from "@/lib/types";
import { reorderBankAccounts, saveBankAccount } from "../actions";

function BankForm({ acc }: { acc?: BankAccount }) {
  return (
    <FormDrawer
      triggerLabel={acc ? "Update Balance" : "+ New Account"}
      triggerVariant={acc ? "secondary" : "primary"}
      title={acc ? "Update Bank Account" : "New Bank Account"}
      description="Balances update automatically for Stripe & Airwallex; others are entered here."
      action={saveBankAccount}
      submitLabel="Save Account"
    >
      {acc && <input type="hidden" name="id" value={acc.id} />}
      <Field label="Account Name" required>
        <Input name="account_name" defaultValue={acc?.account_name} required />
      </Field>
      <Field label="Bank">
        <Input name="bank" defaultValue={acc?.bank ?? ""} placeholder="e.g. Maybank" />
      </Field>
      <Field label="Current Balance" required>
        <MoneyInput name="current_balance" defaultValue={acc?.current_balance ?? 0} required />
      </Field>
      <Field label="Balance As Of">
        <DateWithToday name="balance_as_of" defaultValue={acc?.balance_as_of ?? todayISO()} />
      </Field>
      <Field label="Status">
        <Select name="active" defaultValue={acc?.active === false ? "false" : "true"}>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
      </Field>
    </FormDrawer>
  );
}

export function NewBankAccountButton() {
  return <BankForm />;
}

export function BankAccountsTable({ accounts }: { accounts: BankAccount[] }) {
  const [items, setItems] = useState(accounts);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  // Adopt the server list when it changes (e.g. after a balance edit), but NOT
  // while a reorder is still saving — otherwise the optimistic order snaps back.
  useEffect(() => {
    if (!pending) setItems(accounts);
  }, [accounts, pending]);

  function onDrop(target: number) {
    if (dragIndex === null || dragIndex === target) return setDragIndex(null);
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(target, 0, moved);
    setItems(next);
    setDragIndex(null);
    startTransition(() => reorderBankAccounts(next.map((a) => a.id)));
  }

  return (
    <Card padded={false}>
      <div className="flex items-center justify-between px-4 py-2.5 text-xs text-muted">
        <span>Drag the ⋮⋮ handle to reorder.</span>
        {pending && <span className="text-brand">Saving order…</span>}
      </div>
      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="border-b border-border bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="w-8 px-2 py-2.5" />
              <th className="px-4 py-2.5 font-medium">Account</th>
              <th className="px-4 py-2.5 font-medium">Bank</th>
              <th className="px-4 py-2.5 text-right font-medium">Balance</th>
              <th className="px-4 py-2.5 font-medium">As Of</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a, i) => (
              <tr
                key={a.id}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(i)}
                className={`border-b border-border last:border-0 hover:bg-gray-50/60 ${
                  dragIndex === i ? "opacity-40" : ""
                }`}
              >
                <td className="cursor-grab px-2 py-3 text-center text-muted select-none" title="Drag to reorder">
                  ⋮⋮
                </td>
                <td className="px-4 py-3 font-medium">{a.account_name}</td>
                <td className="px-4 py-3">{a.bank ?? "—"}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">{formatMYR(a.current_balance)}</td>
                <td className="px-4 py-3">{formatDate(a.balance_as_of)}</td>
                <td className="px-4 py-3">
                  <Chip tone={a.active ? "green" : "gray"}>{a.active ? "Active" : "Inactive"}</Chip>
                </td>
                <td className="px-4 py-3 text-right">
                  <BankForm acc={a} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
