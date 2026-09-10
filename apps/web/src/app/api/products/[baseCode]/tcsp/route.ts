import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";
import { diffFields, recordChanges } from "@/lib/products/change-log";

const specRowSchema = z.object({
  groupName: z.string().min(1),
  criterion: z.string().min(1),
  value: z.string(),
  tolerance: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  sortOrder: z.number(),
});

const tcspSchema = z.object({
  materialCode: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  preparedBy: z.string().nullable().optional(),
  approvedBy: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  specRows: z.array(specRowSchema),
});

export async function PATCH(req: Request, { params }: { params: { baseCode: string } }) {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.MANAGER, UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const product = await prisma.product.findUnique({ where: { baseCode: params.baseCode } });
  if (!product || !product.currentVersionId) {
    return NextResponse.json({ error: "Không tìm thấy mã hàng" }, { status: 404 });
  }

  const parsed = tcspSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const versionId = product.currentVersionId;
  const existing = await prisma.tCSPData.findUnique({ where: { versionId } });

  const nextScalars = {
    materialCode: parsed.data.materialCode ?? null,
    description: parsed.data.description ?? null,
    preparedBy: parsed.data.preparedBy ?? null,
    approvedBy: parsed.data.approvedBy ?? null,
    approvedAt: parsed.data.approvedAt ?? null,
  };
  const prevScalars = existing
    ? {
        materialCode: existing.materialCode,
        description: existing.description,
        preparedBy: existing.preparedBy,
        approvedBy: existing.approvedBy,
        approvedAt: existing.approvedAt ? existing.approvedAt.toISOString() : null,
      }
    : null;
  const changes = diffFields(prevScalars, nextScalars);
  if (existing) {
    // Bảng specRows luôn ghi đè toàn bộ (giống pattern OrderItem của hoanggia-crm) — ghi 1 dòng log
    // tổng hợp thay vì diff từng dòng, đơn giản và đủ dùng cho v1.
    changes.push({ fieldPath: "specRows", oldValue: null, newValue: `${parsed.data.specRows.length} dòng` });
  }

  const tcspData = await prisma.tCSPData.upsert({
    where: { versionId },
    update: { ...nextScalars, approvedAt: nextScalars.approvedAt ? new Date(nextScalars.approvedAt) : null },
    create: { versionId, ...nextScalars, approvedAt: nextScalars.approvedAt ? new Date(nextScalars.approvedAt) : null },
  });

  await prisma.tCSPSpecRow.deleteMany({ where: { tcspId: tcspData.id } });
  if (parsed.data.specRows.length > 0) {
    await prisma.tCSPSpecRow.createMany({
      data: parsed.data.specRows.map((row) => ({ ...row, tcspId: tcspData.id })),
    });
  }

  await recordChanges(versionId, session!.user.id, changes);

  return NextResponse.json({ ok: true });
}
