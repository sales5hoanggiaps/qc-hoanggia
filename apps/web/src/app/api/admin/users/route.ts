import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";

const createUserSchema = z.object({
  fullName: z.string().min(1),
  username: z.string().min(3),
  tempPassword: z.string().min(8),
  role: z.enum([UserRole.QC_STAFF, UserRole.SALES_STAFF, UserRole.MANAGER]),
});

export async function GET() {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const users = await prisma.user.findMany({
    select: { id: true, fullName: true, username: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const parsed = createUserSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.tempPassword, 10);
  const user = await prisma.user.create({
    data: {
      fullName: parsed.data.fullName,
      username: parsed.data.username,
      role: parsed.data.role,
      passwordHash,
    },
    select: { id: true, fullName: true, username: true, role: true, isActive: true, createdAt: true },
  });

  return NextResponse.json({ user }, { status: 201 });
}
