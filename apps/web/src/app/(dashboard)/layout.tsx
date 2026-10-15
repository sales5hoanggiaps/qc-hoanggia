import { auth } from "@/lib/auth";
import { DashboardNav } from "@/components/nav/DashboardNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = session!.user.role; // middleware (Task 5) guarantees a session here

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/50">
      <header className="sticky top-0 z-40 w-full border-b border-gray-200/90 bg-white shadow-sm">
        <DashboardNav role={role} fullName={session!.user.fullName} />
      </header>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
