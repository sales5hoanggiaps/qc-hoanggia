import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { UserRole, prisma } from "@qc/db";
import { SyncPanel } from "@/components/admin/SyncPanel";

export default async function SyncPage() {
  const session = await auth();
  if (session?.user.role !== UserRole.MANAGER && session?.user.role !== UserRole.ADMIN) redirect("/");

  const logs = await prisma.syncLog.findMany({ orderBy: { startedAt: "desc" }, take: 20 });
  const rows = logs.map((l) => ({
    id: l.id,
    startedAt: l.startedAt.toISOString(),
    newProducts: l.newProducts,
    newVersions: l.newVersions,
    updatedLinks: l.updatedLinks,
    flaggedReview: l.flaggedReview,
    duplicateVersionCodes: l.duplicateVersionCodes,
    errorMessage: l.errorMessage,
  }));

  return <SyncPanel initialLogs={rows} />;
}
