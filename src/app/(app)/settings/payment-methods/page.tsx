import { requireRole } from "@/lib/auth";
import { getPaymentMethods } from "@/lib/data/refs";
import { Card, Chip, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { Field, FormDrawer, Input, Select } from "@/components/form";
import { savePaymentMethod } from "../actions";

function MethodForm({ m }: { m?: { id: string; name: string; active: boolean } }) {
  return (
    <FormDrawer
      triggerLabel={m ? "Edit" : "+ New Method"}
      triggerVariant={m ? "secondary" : "primary"}
      title={m ? "Edit Payment Method" : "New Payment Method"}
      action={savePaymentMethod}
      submitLabel="Save Method"
    >
      {m && <input type="hidden" name="id" value={m.id} />}
      <Field label="Name" required>
        <Input name="name" defaultValue={m?.name} required placeholder="e.g. Bank Transfer" />
      </Field>
      <Field label="Status">
        <Select name="active" defaultValue={m?.active === false ? "false" : "true"}>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
      </Field>
    </FormDrawer>
  );
}

export default async function PaymentMethodsPage() {
  await requireRole("finance");
  const methods = await getPaymentMethods();
  return (
    <div>
      <PageHeader title="Payment Methods" subtitle="How money moves in and out." actions={<MethodForm />} />
      {methods.length === 0 ? (
        <EmptyState title="No payment methods yet." action={<MethodForm />} />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <TR><TH>Name</TH><TH>Status</TH><TH right>Actions</TH></TR>
            </THead>
            <TBody>
              {methods.map((m) => (
                <TR key={m.id}>
                  <TD className="font-medium">{m.name}</TD>
                  <TD><Chip tone={m.active ? "green" : "gray"}>{m.active ? "Active" : "Inactive"}</Chip></TD>
                  <TD right><MethodForm m={m} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
