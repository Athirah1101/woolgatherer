import { requireSession } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireSession();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        role={profile.role}
        name={profile.full_name ?? "User"}
        email={profile.email ?? ""}
      />
      <main className="flex-1 overflow-x-hidden px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
