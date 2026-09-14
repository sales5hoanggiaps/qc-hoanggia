import { NextResponse } from "next/server";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";

export async function PATCH(req: Request, { params }: { params: { baseCode: string; versionNumber: string } }) {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.MANAGER, UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
  // Không dùng `session!.user.id` — assertRole ở trên đã ném lỗi nếu role/session không hợp lệ,
  // nhưng TypeScript chưa thu hẹp được điều đó qua try/catch; guard tường minh này thay cho `!`.
  if (!session) return NextResponse.json({ error: "Không đủ quyền truy cập" }, { status: 403 });

  const product = await prisma.product.findUnique({ where: { baseCode: params.baseCode } });
  if (!product) return NextResponse.json({ error: "Không tìm thấy mã hàng" }, { status: 404 });

  const versionNumber = Number(params.versionNumber);
  const version = await prisma.productVersion.findFirst({ where: { productId: product.id, versionNumber } });
  if (!version) return NextResponse.json({ error: "Không tìm thấy phiên bản" }, { status: 404 });

  await prisma.$transaction([
    prisma.productVersion.update({ where: { id: version.id }, data: { needsInheritanceReview: false } }),
    prisma.changeLogEntry.create({
      data: {
        versionId: version.id,
        fieldPath: "inheritanceReviewConfirmed",
        oldValue: "true",
        newValue: "false",
        changedBy: session.user.id,
        source: "MANUAL",
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
