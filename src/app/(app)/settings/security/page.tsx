import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { SecurityDevices } from "./SecurityDevices";

export default async function SecurityPage() {
  const { profile } = await requireSession();
  return (
    <div>
      <PageHeader
        title="Login Security"
        subtitle="2-step verification: signing in needs your password plus a code from an authenticator app."
      />
      <SecurityDevices email={profile.email ?? ""} />
    </div>
  );
}
