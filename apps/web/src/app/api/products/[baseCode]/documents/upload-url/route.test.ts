import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma, UserRole } from "@qc/db";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
import { POST } from "./route";

function mockSession(role: UserRole | null) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    role ? { user: { id: "u1", username: "test", fullName: "Test", role } } : null
  );
}

const baseCode = `DOCURL${Date.now()}`;

describe("/api/products/[baseCode]/documents/upload-url", () => {
  beforeAll(async () => {
    const product = await prisma.product.create({ data: { baseCode, amisProductId: `amis-${baseCode}`, status: "PENDING_QC" } });
    const version = await prisma.productVersion.create({
      data: { productId: product.id, versionNumber: 1, amisProductId: `amis-v-${baseCode}`, name: "Test", isCurrent: true },
    });
    await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: version.id } });
  });

  beforeEach(() => vi.clearAllMocks());

  it("trả 403 khi là QC_STAFF", async () => {
    mockSession(UserRole.QC_STAFF);
    const req = new Request(`http://localhost/api/products/${baseCode}/documents/upload-url`, {
      method: "POST",
      body: JSON.stringify({ fileName: "coa.pdf", mimeType: "application/pdf", size: 1000 }),
    });
    const res = await POST(req, { params: { baseCode } });
    expect(res.status).toBe(403);
  });

  it("MANAGER xin được URL thật, PUT lên đúng URL thành công", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/documents/upload-url`, {
      method: "POST",
      body: JSON.stringify({ fileName: "coa.pdf", mimeType: "application/pdf", size: 12 }),
    });
    const res = await POST(req, { params: { baseCode } });
    expect(res.status).toBe(200);
    const { uploadUrl, storageKey } = await res.json();
    expect(storageKey).toContain(baseCode);

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf", "Content-Length": "12" },
      body: Buffer.from("noi dung xxx"),
    });
    expect(putRes.ok).toBe(true);
  });

  it("trả 400 khi vượt giới hạn dung lượng tài liệu", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/documents/upload-url`, {
      method: "POST",
      body: JSON.stringify({ fileName: "coa.pdf", mimeType: "application/pdf", size: 25 * 1024 * 1024 }),
    });
    const res = await POST(req, { params: { baseCode } });
    expect(res.status).toBe(400);
  });

  afterAll(async () => {
    await prisma.productVersion.deleteMany({ where: { product: { baseCode } } });
    await prisma.product.deleteMany({ where: { baseCode } });
    await prisma.$disconnect();
  });
});
