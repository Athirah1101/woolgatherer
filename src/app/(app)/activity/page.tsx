import { requireRole } from "@/lib/auth";
import { getActivity } from "@/lib/data/activity";
import { Card, Chip, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { formatDateTime } from "@/lib/finance/dates";
import { SearchBox } from "@/components/SearchBox";

const MODULE_LABEL: Record<string, string> = {
  receivable: "Receivable",
  payable: "Payable",
  hrdc_claim: "HRDC",
  bank_account: "Bank Account",
  recurring_payable: "Recurring",
};

function pretty(action: string): string {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole("finance", "management");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const allRows = await getActivity(300);
  const rows = q
    ? allRows.filter((r) => {
        const moduleLabel = MODULE_LABEL[r.entityType] ?? r.entityType;
        return (
          r.actorName.toLowerCase().includes(q) ||
          (r.summary ?? "").toLowerCase().includes(q) ||
          r.action.toLowerCase().includes(q) ||
          moduleLabel.toLowerCase().includes(q)
        );
      })
    : allRows;

  return (
    <div>
      <PageHeader
        title="Change History"
        subtitle="Every change made in FinanceOS — what changed, when, and by whom."
        actions={<SearchBox placeholder="Search history…" className="w-56" />}
      />
      {rows.length === 0 ? (
        <EmptyState title="No activity yet." message="Changes will appear here as your team uses the app." />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <TR>
                <TH>When</TH><TH>User</TH><TH>Module</TH><TH>Action</TH><TH>Details</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap text-muted">{formatDateTime(r.createdAt)}</TD>
                  <TD className="font-medium">{r.actorName}</TD>
                  <TD><Chip tone="gray">{MODULE_LABEL[r.entityType] ?? r.entityType}</Chip></TD>
                  <TD>{pretty(r.action)}</TD>
                  <TD className="text-muted">{r.summary ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
