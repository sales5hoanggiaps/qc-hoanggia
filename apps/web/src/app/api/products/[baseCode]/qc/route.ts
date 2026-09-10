import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";
import { diffFields, recordChanges } from "@/lib/products/change-log";

const qcSchema = z.object({
  checklist: z.string().nullable().optional(),
  knownDefects: z.string().nullable().optional(),
  specialNotes: z.string().nullable().optional(),
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

  const parsed = qcSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const versionId = product.currentVersionId;
  const existing = await prisma.qCData.findUnique({ where: { versionId } });

  const next = {
    checklist: parsed.data.checklist ?? null,
    knownDefects: parsed.data.knownDefects ?? null,
    specialNotes: parsed.data.specialNotes ?? null,
  };
  const prev = existing ? { checklist: existing.checklist, knownDefects: existing.knownDefects, specialNotes: existing.specialNotes } : null;
  const changes = diffFields(prev, next);

  await prisma.qCData.upsert({ where: { versionId }, update: next, create: { versionId, ...next } });
  await recordChanges(versionId, session!.user.id, changes);

  return NextResponse.json({ ok: true });
}
