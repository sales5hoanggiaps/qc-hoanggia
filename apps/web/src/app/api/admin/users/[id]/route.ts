import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";

const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum([UserRole.QC_STAFF, UserRole.MANAGER]).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const parsed = updateUserSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: parsed.data,
    select: { id: true, fullName: true, username: true, role: true, isActive: true },
  });

  return NextResponse.json({ user });
}
