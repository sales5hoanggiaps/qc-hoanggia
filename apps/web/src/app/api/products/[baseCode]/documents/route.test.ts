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

const baseCode = `DOCCRT${Date.now()}`;
let versionId: string;

describe("/api/products/[baseCode]/documents", () => {
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
    const req = new Request(`http://localhost/api/products/${baseCode}/documents`, {
      method: "POST",
      body: JSON.stringify({ storageKey: "products/x/y/z-coa.pdf", kind: "COA", label: "COA lô 1" }),
    });
    const res = await POST(req, { params: { baseCode } });
    expect(res.status).toBe(403);
  });

  it("MANAGER tạo ProductDocument thành công dù DocumentsData chưa từng tồn tại, ghi ChangeLogEntry", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/documents`, {
      method: "POST",
      body: JSON.stringify({ storageKey: "products/x/y/z-coa.pdf", kind: "COA", label: "COA lô 1" }),
    });
    const res = await POST(req, { params: { baseCode } });
    expect(res.status).toBe(200);
    const { id } = await res.json();

    const doc = await prisma.productDocument.findUnique({ where: { id } });
    expect(doc?.label).toBe("COA lô 1");
    expect(doc?.kind).toBe("COA");

    const docsData = await prisma.documentsData.findUnique({ where: { versionId } });
    const rows = await prisma.productDocument.findMany({ where: { documentsId: docsData?.id } });
    expect(rows).toHaveLength(1);

    const logs = await prisma.changeLogEntry.findMany({ where: { versionId } });
    expect(logs.some((l) => l.fieldPath === "documents")).toBe(true);
  });

  afterAll(async () => {
    const docsData = await prisma.documentsData.findUnique({ where: { versionId } });
    if (docsData) await prisma.productDocument.deleteMany({ where: { documentsId: docsData.id } });
    await prisma.documentsData.deleteMany({ where: { versionId } });
    await prisma.changeLogEntry.deleteMany({ where: { versionId } });
    await prisma.productVersion.deleteMany({ where: { id: versionId } });
    await prisma.product.deleteMany({ where: { baseCode } });
    await prisma.$disconnect();
  });
});
