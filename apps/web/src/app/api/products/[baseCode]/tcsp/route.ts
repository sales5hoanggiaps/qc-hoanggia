import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";
import { diffFields, recordChanges } from "@/lib/products/change-log";

// Không dùng `session!.user.id` (non-null assertion) — ban chỉ đạo SDD của plan này (Task 1) đã
// yêu cầu tránh pattern đó dù an toàn tại đây (assertRole đã ném lỗi trước nếu role undefined);
// guard tường minh dưới đây thu hẹp kiểu cho TypeScript mà không cần `!`.

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
  approvedAt: z
    .string()
    .nullable()
    .optional()
    .refine((v) => v == null || !isNaN(Date.parse(v)), { message: "Ngày duyệt không hợp lệ" }),
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
  if (!session) return NextResponse.json({ error: "Không đủ quyền truy cập" }, { status: 403 });

  const product = await prisma.product.findUnique({ where: { baseCode: params.baseCode } });
  if (!product || !product.currentVersionId) {
    return NextResponse.json({ error: "Không tìm thấy mã hàng" }, { status: 404 });
  }

  const parsed = tcspSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const versionId = product.currentVersionId;
  const existing = await prisma.tCSPData.findUnique({ where: { versionId }, include: { specRows: true } });

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

  // Bảng specRows luôn ghi đè toàn bộ (giống pattern OrderItem của hoanggia-crm) — so sánh nội dung
  // dòng cũ (sắp theo sortOrder) với dòng mới để biết THỰC SỰ có đổi hay không, thay vì suy diễn từ
  // `existing` (có TCSPData hay chưa) — 2 việc đó không liên quan tới nhau.
  const prevSpecRowsSorted = (existing?.specRows ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => ({
      groupName: r.groupName,
      criterion: r.criterion,
      value: r.value,
      tolerance: r.tolerance ?? null,
      unit: r.unit ?? null,
      note: r.note ?? null,
    }));
  const nextSpecRowsSorted = parsed.data.specRows
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => ({
      groupName: r.groupName,
      criterion: r.criterion,
      value: r.value,
      tolerance: r.tolerance ?? null,
      unit: r.unit ?? null,
      note: r.note ?? null,
    }));
  const specRowsChanged = JSON.stringify(prevSpecRowsSorted) !== JSON.stringify(nextSpecRowsSorted);
  if (specRowsChanged) {
    changes.push({
      fieldPath: "specRows",
      oldValue: existing ? `${prevSpecRowsSorted.length} dòng` : null,
      newValue: `${nextSpecRowsSorted.length} dòng`,
    });
  }

  // Upsert TCSPData + ghi đè toàn bộ specRows + ghi change log phải atomic: nếu deleteMany chạy
  // xong nhưng createMany hay recordChanges lỗi giữa chừng, không được để mất trắng specRows mà
  // không có gì được ghi nhận. Theo đúng pattern `prisma.$transaction` đã dùng ở
  // apps/worker/src/sync/upsert-product.ts.
  await prisma.$transaction(async (tx) => {
    const tcspData = await tx.tCSPData.upsert({
      where: { versionId },
      update: { ...nextScalars, approvedAt: nextScalars.approvedAt ? new Date(nextScalars.approvedAt) : null },
      create: { versionId, ...nextScalars, approvedAt: nextScalars.approvedAt ? new Date(nextScalars.approvedAt) : null },
    });

    await tx.tCSPSpecRow.deleteMany({ where: { tcspId: tcspData.id } });
    if (parsed.data.specRows.length > 0) {
      await tx.tCSPSpecRow.createMany({
        data: parsed.data.specRows.map((row) => ({ ...row, tcspId: tcspData.id })),
      });
    }

    await recordChanges(versionId, session.user.id, changes, tx);
  });

  return NextResponse.json({ ok: true });
}
