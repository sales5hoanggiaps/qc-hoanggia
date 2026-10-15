import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole, ProductStatus } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError, PRODUCT_EDITORS } from "@/lib/auth/guard";
import { diffFields, recordChanges } from "@/lib/products/change-log";

const packagingSchema = z.object({
  instructions: z.string().nullable().optional(),
  specialNotes: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { baseCode: string } }) {
  const session = await auth();
  try {
    assertRole(session?.user.role, PRODUCT_EDITORS);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
  // Không dùng `session!.user.id` — assertRole ở trên đã ném lỗi nếu role/session không hợp lệ,
  // nhưng TypeScript chưa thu hẹp được điều đó qua try/catch; guard tường minh này thay cho `!`
  // (theo ruling của Task 1 trong SDD ledger của plan này).
  if (!session) return NextResponse.json({ error: "Không đủ quyền truy cập" }, { status: 403 });

  const product = await prisma.product.findUnique({ where: { baseCode: params.baseCode } });
  if (!product || !product.currentVersionId) {
    return NextResponse.json({ error: "Không tìm thấy mã hàng" }, { status: 404 });
  }

  const parsed = packagingSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const versionId = product.currentVersionId;
  const existing = await prisma.packagingData.findUnique({ where: { versionId } });

  const next = { instructions: parsed.data.instructions ?? null, specialNotes: parsed.data.specialNotes ?? null };
  const prev = existing ? { instructions: existing.instructions, specialNotes: existing.specialNotes } : null;
  const changes = diffFields(prev, next);

  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id: product.id }, data: { status: ProductStatus.ACTIVE } });
    await tx.packagingData.upsert({ where: { versionId }, update: next, create: { versionId, ...next } });
    await recordChanges(versionId, session.user.id, changes, tx);
  });

  return NextResponse.json({ ok: true });
}
