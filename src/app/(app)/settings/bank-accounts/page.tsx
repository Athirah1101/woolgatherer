import { requireRole } from "@/lib/auth";
import { getBankAccounts } from "@/lib/data/refs";
import { EmptyState, PageHeader, SummaryCard } from "@/components/ui";
import { formatMYR, sumMoney } from "@/lib/finance/money";
import { getCashHistory } from "@/lib/data/cashHistory";
import { SyncBalancesButton } from "./SyncStripeButton";
import { BankTrendChart } from "./BankTrendChart";
import { BankAccountsTable, NewBankAccountButton } from "./BankAccountsTable";

export default async function BankAccountsPage() {
  await requireRole("finance");
  const [accounts, cashHistory] = await Promise.all([getBankAccounts(), getCashHistory()]);
  const total = sumMoney(accounts.filter((a) => a.active).map((a) => a.current_balance));

  return (
    <div>
      <PageHeader
        title="Bank Accounts"
        subtitle="Current Cash on the Dashboard aggregates active accounts. Stripe & Airwallex (MYR) update automatically each day."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SyncBalancesButton />
            <NewBankAccountButton />
          </div>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <SummaryCard label="Current Cash (active)" value={formatMYR(total)} tone="green" />
        </div>
        <div className="lg:col-span-2">
          <BankTrendChart points={cashHistory} />
        </div>
      </div>
      {accounts.length === 0 ? (
        <EmptyState
          title="No bank accounts yet."
          message="Add an account and its current balance."
          action={<NewBankAccountButton />}
        />
      ) : (
        <BankAccountsTable accounts={accounts} />
      )}
    </div>
  );
}
