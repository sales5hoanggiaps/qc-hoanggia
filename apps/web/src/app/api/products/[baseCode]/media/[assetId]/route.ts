import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";
import { recordChanges } from "@/lib/products/change-log";
import { deleteObject } from "@qc/storage";

async function findEditableAsset(baseCode: string, assetId: string) {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    include: { tcsp: true, qc: true, packaging: true },
  });
  if (!asset) return null;
  const versionId = asset.tcsp?.versionId ?? asset.qc?.versionId ?? asset.packaging?.versionId;
  if (!versionId) return null;
  const version = await prisma.productVersion.findUnique({ where: { id: versionId }, include: { product: true } });
  if (!version || version.product.baseCode !== baseCode || version.product.currentVersionId !== version.id) {
    return null;
  }
  return { asset, versionId };
}

const patchSchema = z.object({ caption: z.string().nullable().optional(), sortOrder: z.number().int().optional() });

export async function PATCH(req: Request, { params }: { params: { baseCode: string; assetId: string } }) {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.MANAGER, UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const found = await findEditableAsset(params.baseCode, params.assetId);
  if (!found) return NextResponse.json({ error: "Không tìm thấy file hoặc không phải phiên bản hiện hành" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await prisma.mediaAsset.update({ where: { id: params.assetId }, data: parsed.data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { baseCode: string; assetId: string } }) {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.MANAGER, UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
  if (!session) return NextResponse.json({ error: "Không đủ quyền truy cập" }, { status: 403 });

  const found = await findEditableAsset(params.baseCode, params.assetId);
  if (!found) return NextResponse.json({ error: "Không tìm thấy file hoặc không phải phiên bản hiện hành" }, { status: 404 });

  await deleteObject(found.asset.storageKey);
  await prisma.$transaction(async (tx) => {
    await tx.mediaAsset.delete({ where: { id: params.assetId } });
    await recordChanges(found.versionId, session.user.id, [{ fieldPath: "media", oldValue: found.asset.caption || found.asset.storageKey.split("/").pop()!, newValue: null }], tx);
  });

  return NextResponse.json({ ok: true });
}
