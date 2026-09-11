import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";
import { recordChanges } from "@/lib/products/change-log";
import { resolveMediaParentId, mediaForeignKeyField } from "@/lib/products/media";

const createSchema = z.object({
  tab: z.enum(["tcsp", "qc", "packaging"]),
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  caption: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
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
    const parentId = await resolveMediaParentId(tx, versionId, parsed.data.tab);
    const fkField = mediaForeignKeyField(parsed.data.tab);
    const asset = await tx.mediaAsset.create({
      data: {
        storageKey: parsed.data.storageKey,
        mimeType: parsed.data.mimeType,
        caption: parsed.data.caption ?? null,
        sortOrder: parsed.data.sortOrder ?? 0,
        [fkField]: parentId,
      },
    });
    await recordChanges(
      versionId,
      session.user.id,
      [{ fieldPath: `media.${parsed.data.tab}`, oldValue: null, newValue: parsed.data.caption || parsed.data.storageKey.split("/").pop()! }],
      tx
    );
    return asset;
  });

  return NextResponse.json({ id: created.id });
}
