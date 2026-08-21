import { requireRole } from "@/lib/auth";
import { getProfiles } from "@/lib/data/refs";
import { Card, Chip, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { Field, FormDrawer, Input, Select } from "@/components/form";
import type { Profile } from "@/lib/types";
import { saveUserAccess } from "../actions";

const ROLE_TONE = { finance: "indigo", sales: "blue", management: "amber" } as const;

function AccessForm({ p }: { p: Profile }) {
  return (
    <FormDrawer
      triggerLabel="Manage Access"
      triggerVariant="secondary"
      title="Manage Access"
      description={p.email ?? undefined}
      action={saveUserAccess}
      submitLabel="Save Access"
    >
      <input type="hidden" name="id" value={p.id} />
      <Field label="Full Name">
        <Input name="full_name" defaultValue={p.full_name ?? ""} />
      </Field>
      <Field label="Role" required hint="Sales users only see their own receivables. Finance has full access. Management is read-only high-level.">
        <Select name="role" defaultValue={p.role}>
          <option value="finance">Finance</option>
          <option value="sales">Sales</option>
          <option value="management">Management</option>
        </Select>
      </Field>
      <Field label="Sales PIC name" hint="Must match the Sales PIC used on receivables (only used for Sales role).">
        <Input name="sales_pic" defaultValue={p.sales_pic ?? ""} placeholder="e.g. Aiman Rahman" />
      </Field>
      <Field label="Status">
        <Select name="active" defaultValue={p.active ? "true" : "false"}>
          <option value="true">Active</option>
          <option value="false">Disabled</option>
        </Select>
      </Field>
    </FormDrawer>
  );
}

export default async function UsersPage() {
  await requireRole("finance");
  const profiles = await getProfiles();
  return (
    <div>
      <PageHeader
        title="Users & Access"
        subtitle="Set each person's access level. New login accounts are provisioned in Supabase Auth (see README)."
      />
      <Card padded={false}>
        <Table>
          <THead>
            <TR><TH>Name</TH><TH>Email</TH><TH>Role</TH><TH>Sales PIC</TH><TH>Status</TH><TH right>Actions</TH></TR>
          </THead>
          <TBody>
            {profiles.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium">{p.full_name ?? "—"}</TD>
                <TD className="text-muted">{p.email}</TD>
                <TD><Chip tone={ROLE_TONE[p.role]}>{p.role}</Chip></TD>
                <TD>{p.sales_pic ?? "—"}</TD>
                <TD><Chip tone={p.active ? "green" : "gray"}>{p.active ? "Active" : "Disabled"}</Chip></TD>
                <TD right><AccessForm p={p} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
