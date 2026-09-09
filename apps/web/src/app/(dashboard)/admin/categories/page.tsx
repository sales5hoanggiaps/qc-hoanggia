import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { UserRole } from "@qc/db";
import { CategoriesPanel } from "@/components/admin/CategoriesPanel";

export default async function CategoriesPage() {
  const session = await auth();
  if (session?.user.role !== UserRole.MANAGER && session?.user.role !== UserRole.ADMIN) redirect("/");
  return <CategoriesPanel />;
}
