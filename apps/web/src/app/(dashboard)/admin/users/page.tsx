import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { UserRole } from "@qc/db";
import { UsersPanel } from "@/components/admin/UsersPanel";

export default async function UsersPage() {
  const session = await auth();
  if (session?.user.role !== UserRole.ADMIN) redirect("/");
  return <UsersPanel />;
}
