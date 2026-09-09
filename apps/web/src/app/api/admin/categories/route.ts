import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";

const MANAGER_OR_ADMIN = [UserRole.MANAGER, UserRole.ADMIN];
const createCategorySchema = z.object({ name: z.string().min(1) });

export async function GET() {
  const session = await auth();
  try {
    assertRole(session?.user.role, MANAGER_OR_ADMIN);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ categories });
}

export async function POST(req: Request) {
  const session = await auth();
  try {
    assertRole(session?.user.role, MANAGER_OR_ADMIN);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const parsed = createCategorySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const category = await prisma.category.create({ data: { name: parsed.data.name } });
  return NextResponse.json({ category }, { status: 201 });
}
