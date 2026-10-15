import { NextResponse } from "next/server";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError, PRODUCT_EDITORS } from "@/lib/auth/guard";
import { recordChanges } from "@/lib/products/change-log";
import { deleteObject } from "@qc/storage";

export async function DELETE(_req: Request, { params }: { params: { baseCode: string; docId: string } }) {
  const session = await auth();
  try {
    assertRole(session?.user.role, PRODUCT_EDITORS);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
  if (!session) return NextResponse.json({ error: "Không đủ quyền truy cập" }, { status: 403 });

  const doc = await prisma.productDocument.findUnique({ where: { id: params.docId }, include: { documents: true } });
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });
  const version = await prisma.productVersion.findUnique({ where: { id: doc.documents.versionId }, include: { product: true } });
  if (!version || version.product.baseCode !== params.baseCode || version.product.currentVersionId !== version.id) {
    return NextResponse.json({ error: "Không tìm thấy hoặc không phải phiên bản hiện hành" }, { status: 404 });
  }

  // Xóa DB trước, xóa file MinIO SAU khi transaction đã commit thành công — nếu làm ngược lại và
  // transaction lỗi giữa chừng, sẽ để lại 1 dòng ProductDocument trỏ tới file đã mất. Object mồ côi
  // trên MinIO nếu deleteObject lỗi sau commit là vấn đề rẻ hơn nhiều (chỉ tốn dung lượng) — cùng
  // nguyên tắc đã áp dụng ở media/[assetId]/route.ts (Task 2 fix).
  await prisma.$transaction(async (tx) => {
    await tx.productDocument.delete({ where: { id: params.docId } });
    await recordChanges(version.id, session.user.id, [{ fieldPath: "documents", oldValue: doc.label, newValue: null }], tx);
  });
  await deleteObject(doc.storageKey);

  return NextResponse.json({ ok: true });
}
