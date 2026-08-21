import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getReceivableDetail } from "@/lib/data/receivables";
import { PageHeader } from "@/components/ui";
import { NewHrdcForm, type HrdcDefaults } from "../NewHrdcForm";

export default async function NewHrdcPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole("finance");
  const sp = await searchParams;
  let defaults: HrdcDefaults = {};

  if (sp.receivable) {
    const detail = await getReceivableDetail(sp.receivable);
    if (detail) {
      defaults = {
        receivable_id: detail.receivable.id,
        client_name: detail.receivable.client_name,
        contact_name: detail.receivable.contact_name ?? undefined,
        product: detail.receivable.product ?? undefined,
        sales_pic: detail.receivable.sales_pic ?? undefined,
        amount_client_paid: detail.summary.totalPaid,
      };
    }
  }

  return (
    <div>
      <div className="mb-2">
        <Link href="/hrdc" className="text-sm text-muted hover:text-brand">← HRDC Claims</Link>
      </div>
      <PageHeader
        title="New HRDC Claim"
        subtitle={defaults.receivable_id ? "Linked to a receivable — client details reused." : "Track a client's HRD Corp claim through its full lifecycle."}
      />
      <NewHrdcForm defaults={defaults} />
    </div>
  );
}
