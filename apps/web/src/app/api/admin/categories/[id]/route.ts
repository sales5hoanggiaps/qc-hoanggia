import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";

const MANAGER_OR_ADMIN = [UserRole.MANAGER, UserRole.ADMIN];
const renameCategorySchema = z.object({ name: z.string().min(1) });

async function checkAccess() {
  const session = await auth();
  assertRole(session?.user.role, MANAGER_OR_ADMIN);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await checkAccess();
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const parsed = renameCategorySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const category = await prisma.category.update({ where: { id: params.id }, data: { name: parsed.data.name } });
  return NextResponse.json({ category });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await checkAccess();
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  await prisma.category.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
