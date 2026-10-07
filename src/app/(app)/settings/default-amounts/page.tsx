import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCategories, categoryName } from "@/lib/data/refs";
import { Card, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ComboSelect, Field, FormDrawer, InlineSubmit, Input, MoneyInput } from "@/components/form";
import { formatMYR } from "@/lib/finance/money";
import { deleteDefaultAmount, saveDefaultAmount } from "../actions";

interface DefaultRow {
  id: string;
  payee: string;
  category_id: string | null;
  amount: number | string;
}

function DefaultForm({ d, cats }: { d?: DefaultRow; cats: { id: string; name: string }[] }) {
  return (
    <FormDrawer
      triggerLabel={d ? "Edit" : "+ New Default"}
      triggerVariant={d ? "secondary" : "primary"}
      title={d ? "Edit Default Amount" : "New Default Amount"}
      action={saveDefaultAmount}
      submitLabel="Save Default"
    >
      {d && <input type="hidden" name="id" value={d.id} />}
      <Field label="Payee / Vendor" required hint="Must match how the payee is typed on payables (capitals don't matter).">
        <Input name="payee" defaultValue={d?.payee} required placeholder="e.g. Nini" />
      </Field>
      <Field label="Category" hint="Leave blank to use this amount for the payee under any category.">
        <ComboSelect name="category_id" defaultValue={d?.category_id ?? ""}>
          <option value="">Any category</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </ComboSelect>
      </Field>
      <Field label="Default Amount" required>
        <MoneyInput name="amount" defaultValue={d?.amount} required />
      </Field>
    </FormDrawer>
  );
}

export default async function DefaultAmountsPage() {
  await requireRole("finance");
  const supabase = await createClient();
  const [{ data }, cats] = await Promise.all([
    supabase.from("payable_defaults").select("*").order("payee"),
    getCategories("payable"),
  ]);
  const rows = (data ?? []) as DefaultRow[];
  const catList = cats.map((c) => ({ id: c.id, name: c.name }));
  return (
    <div>
      <PageHeader
        title="Default Amounts"
        subtitle="When you add a payable for one of these payees (and category), the amount fills in automatically — you can still change it."
        actions={<DefaultForm cats={catList} />}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No default amounts yet."
          message="Add one here, or tick “Remember this amount as the default” when creating a payable."
        />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <TR><TH>Payee</TH><TH>Category</TH><TH right>Default Amount</TH><TH right>Actions</TH></TR>
            </THead>
            <TBody>
              {rows.map((d) => (
                <TR key={d.id}>
                  <TD className="font-medium">{d.payee}</TD>
                  <TD className="text-muted">{d.category_id ? categoryName(cats, d.category_id) : "Any category"}</TD>
                  <TD right className="font-medium tabular-nums">{formatMYR(Number(d.amount))}</TD>
                  <TD right>
                    <div className="flex justify-end gap-1">
                      <DefaultForm d={d} cats={catList} />
                      <form action={deleteDefaultAmount}>
                        <input type="hidden" name="id" value={d.id} />
                        <InlineSubmit variant="danger" confirm="Remove this default amount?">Remove</InlineSubmit>
                      </form>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
