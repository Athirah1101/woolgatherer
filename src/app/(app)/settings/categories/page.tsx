import { requireRole } from "@/lib/auth";
import { getCategories } from "@/lib/data/refs";
import {
  Card, Chip, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR,
} from "@/components/ui";
import { Field, FormDrawer, Input, Select } from "@/components/form";
import { saveCategory } from "../actions";

function CategoryForm({
  cat,
}: {
  cat?: { id: string; name: string; kind: string; active: boolean };
}) {
  return (
    <FormDrawer
      triggerLabel={cat ? "Edit" : "+ New Category"}
      triggerVariant={cat ? "secondary" : "primary"}
      title={cat ? "Edit Category" : "New Category"}
      action={saveCategory}
      submitLabel="Save Category"
    >
      {cat && <input type="hidden" name="id" value={cat.id} />}
      <Field label="Name" required>
        <Input name="name" defaultValue={cat?.name} required />
      </Field>
      <Field label="Applies To" required>
        <Select name="kind" defaultValue={cat?.kind ?? "expense"}>
          <option value="expense">Expenses</option>
          <option value="payable">Payables</option>
        </Select>
      </Field>
      <Field label="Status">
        <Select name="active" defaultValue={cat?.active === false ? "false" : "true"}>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
      </Field>
    </FormDrawer>
  );
}

export default async function CategoriesPage() {
  await requireRole("finance");
  const cats = await getCategories();

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle="Used to classify expenses and payables. Add your own anytime."
        actions={<CategoryForm />}
      />
      {cats.length === 0 ? (
        <EmptyState title="No categories yet." message="Add your first category to start classifying spend." action={<CategoryForm />} />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Applies To</TH>
                <TH>Status</TH>
                <TH right>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {cats.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">{c.name}</TD>
                  <TD>
                    <Chip tone={c.kind === "payable" ? "indigo" : "blue"}>
                      {c.kind === "payable" ? "Payables" : "Expenses"}
                    </Chip>
                  </TD>
                  <TD>
                    <Chip tone={c.active ? "green" : "gray"}>{c.active ? "Active" : "Inactive"}</Chip>
                  </TD>
                  <TD right>
                    <CategoryForm cat={c} />
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
