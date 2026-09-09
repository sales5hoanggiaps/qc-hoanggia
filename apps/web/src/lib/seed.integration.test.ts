import { describe, expect, it, afterAll } from "vitest";
import { prisma, UserRole } from "@qc/db";

describe("seed data", () => {
  it("có tài khoản admin và 3 danh mục mẫu sau khi seed", async () => {
    const admin = await prisma.user.findUnique({ where: { username: "admin" } });
    expect(admin?.role).toBe(UserRole.ADMIN);
    expect(admin?.isActive).toBe(true);

    const categoryCount = await prisma.category.count();
    expect(categoryCount).toBeGreaterThanOrEqual(3);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
