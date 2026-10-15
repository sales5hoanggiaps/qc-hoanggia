import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";

const createUserSchema = z.object({
  fullName: z.string().trim().min(1, "Vui lòng nhập họ tên"),
  username: z.string().trim().min(3, "Tên đăng nhập phải có ít nhất 3 ký tự"),
  tempPassword: z.string().min(6, "Mật khẩu tạm phải có ít nhất 6 ký tự"),
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
    const issues = parsed.error.issues;
    const firstIssue = issues[0];
    let msg = "Dữ liệu không hợp lệ";
    if (firstIssue) {
      if (firstIssue.path.includes("username")) {
        msg = "Tên đăng nhập phải có ít nhất 3 ký tự";
      } else if (firstIssue.path.includes("tempPassword")) {
        msg = "Mật khẩu tạm phải có ít nhất 6 ký tự";
      } else if (firstIssue.path.includes("fullName")) {
        msg = "Vui lòng nhập họ tên";
      }
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Kiểm tra tên đăng nhập đã tồn tại chưa
  const existingUser = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  });
  if (existingUser) {
    return NextResponse.json(
      { error: `Tên đăng nhập "${parsed.data.username}" đã tồn tại trên hệ thống. Vui lòng chọn tên khác.` },
      { status: 409 }
    );
  }

  try {
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
  } catch (err: unknown) {
    console.error("Lỗi tạo user:", err);
    return NextResponse.json(
      { error: "Không thể tạo tài khoản do lỗi hệ thống. Vui lòng thử lại." },
      { status: 500 }
    );
  }
}
