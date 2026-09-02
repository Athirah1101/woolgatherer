import { requireRole } from "@/lib/auth";
import { getBankAccounts } from "@/lib/data/refs";
import { EmptyState, PageHeader, SummaryCard } from "@/components/ui";
import { formatMYR, sumMoney } from "@/lib/finance/money";
import { formatDateTime } from "@/lib/finance/dates";
import { getCashHistory } from "@/lib/data/cashHistory";
import { SyncBalancesButton } from "./SyncStripeButton";
import { PostToLarkButton } from "./PostToLarkButton";
import { BankTrendChart } from "./BankTrendChart";
import { BankAccountsTable, NewBankAccountButton } from "./BankAccountsTable";

// Allow the manual "Sync balances now" action extra time: the Payex sync pages
// through its full transaction history, which can take longer than the instant
// Stripe/Airwallex balance calls.
export const maxDuration = 60;

export default async function BankAccountsPage() {
  await requireRole("finance");
  const [accounts, cashHistory] = await Promise.all([getBankAccounts(), getCashHistory()]);
  const total = sumMoney(accounts.filter((a) => a.active).map((a) => a.current_balance));
  const lastUpdated = accounts
    .map((a) => a.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div>
      <PageHeader
        title="Bank Accounts"
        subtitle="Stripe, Airwallex & Payex (MYR) auto-update daily at midnight (MYT). Press “Sync balances now” anytime for the latest. Current Cash on the Dashboard sums the active accounts."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SyncBalancesButton />
            <PostToLarkButton />
            <NewBankAccountButton />
          </div>
        }
      />
      <div className="mb-6 max-w-xs">
        <SummaryCard
          label="Current Cash (active)"
          value={formatMYR(total)}
          tone="green"
          sub={lastUpdated ? `Last updated ${formatDateTime(lastUpdated)}` : undefined}
        />
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

      <div className="mt-6">
        <BankTrendChart points={cashHistory} />
      </div>
    </div>
  );
}
