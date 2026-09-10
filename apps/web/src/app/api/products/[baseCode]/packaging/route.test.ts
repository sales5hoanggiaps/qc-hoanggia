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

const baseCode = `PKGRT${Date.now()}`;
let versionId: string;

describe("/api/products/[baseCode]/packaging", () => {
  beforeAll(async () => {
    const product = await prisma.product.create({ data: { baseCode, amisProductId: `amis-${baseCode}`, status: "PENDING_QC" } });
    const version = await prisma.productVersion.create({
      data: { productId: product.id, versionNumber: 1, amisProductId: `amis-v-${baseCode}`, name: "Test", isCurrent: true },
    });
    await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: version.id } });
    versionId = version.id;
  });

  beforeEach(() => vi.clearAllMocks());

  it("trả 403 khi là QC_STAFF", async () => {
    mockSession(UserRole.QC_STAFF);
    const req = new Request(`http://localhost/api/products/${baseCode}/packaging`, {
      method: "PATCH",
      body: JSON.stringify({ instructions: "x" }),
    });
    const res = await PATCH(req, { params: { baseCode } });
    expect(res.status).toBe(403);
  });

  it("MANAGER lưu được và ghi ChangeLogEntry", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/packaging`, {
      method: "PATCH",
      body: JSON.stringify({ instructions: "Đóng gói bọc túi", specialNotes: null }),
    });
    const res = await PATCH(req, { params: { baseCode } });
    expect(res.status).toBe(200);

    const packaging = await prisma.packagingData.findUnique({ where: { versionId } });
    expect(packaging?.instructions).toBe("Đóng gói bọc túi");

    const logs = await prisma.changeLogEntry.findMany({ where: { versionId } });
    expect(logs.some((l) => l.fieldPath === "instructions")).toBe(true);
  });

  afterAll(async () => {
    await prisma.packagingData.deleteMany({ where: { versionId } });
    await prisma.changeLogEntry.deleteMany({ where: { versionId } });
    await prisma.productVersion.deleteMany({ where: { id: versionId } });
    await prisma.product.deleteMany({ where: { baseCode } });
    await prisma.$disconnect();
  });
});
