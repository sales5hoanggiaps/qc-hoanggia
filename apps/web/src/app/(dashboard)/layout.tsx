import { auth } from "@/lib/auth";
import { DashboardNav } from "@/components/nav/DashboardNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = session!.user.role; // middleware (Task 5) guarantees a session here

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r border-gray-200 bg-white">
        <DashboardNav role={role} fullName={session!.user.fullName} />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
