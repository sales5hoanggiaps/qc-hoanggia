import { describe, expect, it, afterAll } from "vitest";
import { prisma, UserRole } from "@qc/db";
import { diffFields, recordChanges } from "./change-log";

describe("diffFields", () => {
  it("chỉ trả về các field thực sự thay đổi", () => {
    const changes = diffFields({ a: "1", b: "x" }, { a: "1", b: "y" });
    expect(changes).toEqual([{ fieldPath: "b", oldValue: "x", newValue: "y" }]);
  });

  it("coi null cũ (chưa có dữ liệu) là hợp lệ khi so sánh", () => {
    const changes = diffFields(null, { a: "1" });
    expect(changes).toEqual([{ fieldPath: "a", oldValue: null, newValue: "1" }]);
  });

  it("trả về mảng rỗng khi không có gì đổi", () => {
    expect(diffFields({ a: "1" }, { a: "1" })).toEqual([]);
  });
});

describe("recordChanges", () => {
  let testUser: { id: string };
  let testVersion: { id: string };

  it("ghi ChangeLogEntry nguồn MANUAL cho từng field đổi", async () => {
    testUser = await prisma.user.create({
      data: { fullName: "CL Test", username: `cltest${Date.now()}`, passwordHash: "x", role: UserRole.MANAGER },
    });
    const product = await prisma.product.create({
      data: { baseCode: `CLTEST${Date.now()}`, amisProductId: `cltest-${Date.now()}`, status: "PENDING_QC" },
    });
    testVersion = await prisma.productVersion.create({
      data: { productId: product.id, versionNumber: 1, amisProductId: `cltest-v-${Date.now()}`, name: "x", isCurrent: true },
    });

    await recordChanges(testVersion.id, testUser.id, [{ fieldPath: "description", oldValue: null, newValue: "Mô tả mới" }]);

    const logs = await prisma.changeLogEntry.findMany({ where: { versionId: testVersion.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ fieldPath: "description", oldValue: null, newValue: "Mô tả mới", changedBy: testUser.id, source: "MANUAL" });
  });

  it("không ghi gì khi mảng changes rỗng", async () => {
    await recordChanges(testVersion.id, testUser.id, []);
    const logs = await prisma.changeLogEntry.findMany({ where: { versionId: testVersion.id } });
    expect(logs).toHaveLength(1); // vẫn chỉ 1 dòng từ test trước, không tăng thêm
  });

  afterAll(async () => {
    await prisma.changeLogEntry.deleteMany({ where: { versionId: testVersion.id } });
    await prisma.productVersion.deleteMany({ where: { id: testVersion.id } });
    await prisma.product.deleteMany({ where: { baseCode: { startsWith: "CLTEST" } } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
    await prisma.$disconnect();
  });
});
