import { requireRole } from "@/lib/auth";
import { getBankAccounts } from "@/lib/data/refs";
import { Card, Chip, EmptyState, PageHeader, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { Field, FormDrawer, Input, MoneyInput, Select } from "@/components/form";
import { formatMYR } from "@/lib/finance/money";
import { formatDate, todayISO } from "@/lib/finance/dates";
import { sumMoney } from "@/lib/finance/money";
import { saveBankAccount } from "../actions";

function BankForm({
  acc,
}: {
  acc?: {
    id: string; account_name: string; bank: string | null;
    current_balance: number; balance_as_of: string | null; active: boolean;
  };
}) {
  return (
    <FormDrawer
      triggerLabel={acc ? "Update Balance" : "+ New Account"}
      triggerVariant={acc ? "secondary" : "primary"}
      title={acc ? "Update Bank Account" : "New Bank Account"}
      description="Balances are entered manually in V1 — no bank integration."
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
        <Input type="date" name="balance_as_of" defaultValue={acc?.balance_as_of ?? todayISO()} />
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

export default async function BankAccountsPage() {
  await requireRole("finance");
  const accounts = await getBankAccounts();
  const total = sumMoney(accounts.filter((a) => a.active).map((a) => a.current_balance));

  return (
    <div>
      <PageHeader
        title="Bank Accounts"
        subtitle="Current Cash on the Dashboard aggregates active accounts."
        actions={<BankForm />}
      />
      <div className="mb-6 max-w-xs">
        <SummaryCard label="Current Cash (active)" value={formatMYR(total)} tone="green" />
      </div>
      {accounts.length === 0 ? (
        <EmptyState title="No bank accounts yet." message="Add an account and its current balance." action={<BankForm />} />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <TR><TH>Account</TH><TH>Bank</TH><TH right>Balance</TH><TH>As Of</TH><TH>Status</TH><TH right>Actions</TH></TR>
            </THead>
            <TBody>
              {accounts.map((a) => (
                <TR key={a.id}>
                  <TD className="font-medium">{a.account_name}</TD>
                  <TD>{a.bank ?? "—"}</TD>
                  <TD right className="font-medium">{formatMYR(a.current_balance)}</TD>
                  <TD>{formatDate(a.balance_as_of)}</TD>
                  <TD><Chip tone={a.active ? "green" : "gray"}>{a.active ? "Active" : "Inactive"}</Chip></TD>
                  <TD right><BankForm acc={a} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
