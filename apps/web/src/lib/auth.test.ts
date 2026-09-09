import { describe, expect, it, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { prisma, UserRole } from "@qc/db";
import { verifyCredentials } from "./auth";

describe("verifyCredentials", () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("mat-khau-dung", 10);
    await prisma.user.create({
      data: {
        fullName: "Nhân viên QC Test",
        username: "qc.test",
        passwordHash,
        role: UserRole.QC_STAFF,
        isActive: true,
      },
    });
    await prisma.user.create({
      data: {
        fullName: "Tài khoản đã khoá",
        username: "khoa.test",
        passwordHash,
        role: UserRole.QC_STAFF,
        isActive: false,
      },
    });
  });

  it("trả về user khi username/mật khẩu đúng và tài khoản đang hoạt động", async () => {
    const user = await verifyCredentials("qc.test", "mat-khau-dung");
    expect(user).toMatchObject({ username: "qc.test", role: UserRole.QC_STAFF });
  });

  it("trả về null khi sai mật khẩu", async () => {
    expect(await verifyCredentials("qc.test", "sai-mat-khau")).toBeNull();
  });

  it("trả về null khi username không tồn tại", async () => {
    expect(await verifyCredentials("khong-ton-tai", "bat-ky")).toBeNull();
  });

  it("trả về null khi tài khoản bị khoá (isActive = false)", async () => {
    expect(await verifyCredentials("khoa.test", "mat-khau-dung")).toBeNull();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: { in: ["qc.test", "khoa.test"] } } });
    await prisma.$disconnect();
  });
});
