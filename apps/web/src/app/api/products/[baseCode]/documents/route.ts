import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";
import { recordChanges } from "@/lib/products/change-log";

const createSchema = z.object({
  storageKey: z.string().min(1),
  kind: z.enum(["COA", "MSDS", "ROHS", "OTHER"]),
  label: z.string().min(1),
});

export async function POST(req: Request, { params }: { params: { baseCode: string } }) {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.MANAGER, UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
  if (!session) return NextResponse.json({ error: "Không đủ quyền truy cập" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const product = await prisma.product.findUnique({ where: { baseCode: params.baseCode } });
  if (!product || !product.currentVersionId) {
    return NextResponse.json({ error: "Không tìm thấy mã hàng" }, { status: 404 });
  }
  const versionId = product.currentVersionId;

  const created = await prisma.$transaction(async (tx) => {
    const docsData = await tx.documentsData.upsert({ where: { versionId }, update: {}, create: { versionId } });
    const doc = await tx.productDocument.create({
      data: { documentsId: docsData.id, kind: parsed.data.kind, label: parsed.data.label, storageKey: parsed.data.storageKey },
    });
    await recordChanges(versionId, session.user.id, [{ fieldPath: "documents", oldValue: null, newValue: parsed.data.label }], tx);
    return doc;
  });

  return NextResponse.json({ id: created.id });
}
