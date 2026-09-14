import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma, UserRole } from "@qc/db";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
import { PATCH } from "./route";

function mockSession(role: UserRole | null) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    role ? { user: { id: "u1", username: "test", fullName: "Test", role } } : null
  );
}

const baseCode = `CIRT${Date.now()}`;
let versionId: string;

describe("/api/products/[baseCode]/versions/[versionNumber]/confirm-inheritance", () => {
  beforeAll(async () => {
    const product = await prisma.product.create({ data: { baseCode, amisProductId: `amis-${baseCode}`, status: "PENDING_QC" } });
    const version = await prisma.productVersion.create({
      data: { productId: product.id, versionNumber: 1, amisProductId: `amis-v-${baseCode}`, name: "Test", isCurrent: true, needsInheritanceReview: true },
    });
    await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: version.id } });
    versionId = version.id;
  });

  beforeEach(() => vi.clearAllMocks());

  it("trả 403 khi là QC_STAFF", async () => {
    mockSession(UserRole.QC_STAFF);
    const req = new Request(`http://localhost/api/products/${baseCode}/versions/1/confirm-inheritance`, { method: "PATCH" });
    const res = await PATCH(req, { params: { baseCode, versionNumber: "1" } });
    expect(res.status).toBe(403);

    const version = await prisma.productVersion.findUnique({ where: { id: versionId } });
    expect(version?.needsInheritanceReview).toBe(true); // không đổi gì
  });

  it("MANAGER xác nhận được — xoá cờ và ghi ChangeLogEntry", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/versions/1/confirm-inheritance`, { method: "PATCH" });
    const res = await PATCH(req, { params: { baseCode, versionNumber: "1" } });
    expect(res.status).toBe(200);

    const version = await prisma.productVersion.findUnique({ where: { id: versionId } });
    expect(version?.needsInheritanceReview).toBe(false);

    const logs = await prisma.changeLogEntry.findMany({ where: { versionId } });
    expect(logs.some((l) => l.fieldPath === "inheritanceReviewConfirmed" && l.source === "MANUAL" && l.changedBy === "u1")).toBe(true);
  });

  it("trả 404 khi baseCode không tồn tại", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/KHONGTONTAI/versions/1/confirm-inheritance`, { method: "PATCH" });
    const res = await PATCH(req, { params: { baseCode: "KHONGTONTAI", versionNumber: "1" } });
    expect(res.status).toBe(404);
  });

  afterAll(async () => {
    await prisma.changeLogEntry.deleteMany({ where: { versionId } });
    await prisma.productVersion.deleteMany({ where: { id: versionId } });
    await prisma.product.deleteMany({ where: { baseCode } });
    await prisma.$disconnect();
  });
});
