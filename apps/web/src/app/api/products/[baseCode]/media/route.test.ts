import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma, UserRole } from "@qc/db";
import { buildStorageKey } from "@qc/storage";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
import { POST } from "./route";

function mockSession(role: UserRole | null) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    role ? { user: { id: "u1", username: "test", fullName: "Test", role } } : null
  );
}

const baseCode = `MEDCRT${Date.now()}`;
let versionId: string;

describe("/api/products/[baseCode]/media", () => {
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
    const req = new Request(`http://localhost/api/products/${baseCode}/media`, {
      method: "POST",
      body: JSON.stringify({ tab: "tcsp", storageKey: "products/x/y/z-anh.jpg", mimeType: "image/jpeg" }),
    });
    const res = await POST(req, { params: { baseCode } });
    expect(res.status).toBe(403);
  });

  it("MANAGER tạo MediaAsset thành công dù TCSPData chưa từng tồn tại, ghi ChangeLogEntry", async () => {
    mockSession(UserRole.MANAGER);
    const storageKey = buildStorageKey(baseCode, versionId, "anh.jpg");
    const req = new Request(`http://localhost/api/products/${baseCode}/media`, {
      method: "POST",
      body: JSON.stringify({ tab: "tcsp", storageKey, mimeType: "image/jpeg", caption: "Ảnh mặt trước", sortOrder: 0 }),
    });
    const res = await POST(req, { params: { baseCode } });
    expect(res.status).toBe(200);
    const { id } = await res.json();

    const asset = await prisma.mediaAsset.findUnique({ where: { id } });
    expect(asset?.caption).toBe("Ảnh mặt trước");

    const tcsp = await prisma.tCSPData.findUnique({ where: { versionId } });
    const rows = await prisma.mediaAsset.findMany({ where: { tcspId: tcsp?.id } });
    expect(rows).toHaveLength(1);

    const logs = await prisma.changeLogEntry.findMany({ where: { versionId } });
    expect(logs.some((l) => l.fieldPath === "media.tcsp")).toBe(true);
  });

  it("trả 400 khi storageKey không thuộc phiên bản hiện hành, không tạo dòng DB", async () => {
    mockSession(UserRole.MANAGER);
    const foreignKey = buildStorageKey(baseCode, "other-version-id", "anh.jpg");
    const req = new Request(`http://localhost/api/products/${baseCode}/media`, {
      method: "POST",
      body: JSON.stringify({ tab: "tcsp", storageKey: foreignKey, mimeType: "image/jpeg" }),
    });
    const res = await POST(req, { params: { baseCode } });
    expect(res.status).toBe(400);

    const asset = await prisma.mediaAsset.findFirst({ where: { storageKey: foreignKey } });
    expect(asset).toBeNull();
  });

  afterAll(async () => {
    const tcsp = await prisma.tCSPData.findUnique({ where: { versionId } });
    if (tcsp) await prisma.mediaAsset.deleteMany({ where: { tcspId: tcsp.id } });
    await prisma.tCSPData.deleteMany({ where: { versionId } });
    await prisma.changeLogEntry.deleteMany({ where: { versionId } });
    await prisma.productVersion.deleteMany({ where: { id: versionId } });
    await prisma.product.deleteMany({ where: { baseCode } });
    await prisma.$disconnect();
  });
});
