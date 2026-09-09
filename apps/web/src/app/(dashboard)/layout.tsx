import { auth } from "@/lib/auth";
import { DashboardNav } from "@/components/nav/DashboardNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = session!.user.role; // middleware (Task 5) guarantees a session here

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r bg-white">
        <DashboardNav role={role} />
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}
