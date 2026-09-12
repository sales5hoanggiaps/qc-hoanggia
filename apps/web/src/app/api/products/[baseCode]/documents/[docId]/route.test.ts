import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma, UserRole } from "@qc/db";
import { buildStorageKey, getUploadUrl, getViewUrl } from "@qc/storage";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
import { DELETE } from "./route";

function mockSession(role: UserRole | null) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    role ? { user: { id: "u1", username: "test", fullName: "Test", role } } : null
  );
}

const baseCode = `DOCAST${Date.now()}`;
let currentVersionId: string;
let oldVersionId: string;
let docsCurrentId: string;
let docsOldId: string;
let currentDocId: string;
let oldDocId: string;

describe("/api/products/[baseCode]/documents/[docId]", () => {
  beforeAll(async () => {
    const product = await prisma.product.create({ data: { baseCode, amisProductId: `amis-${baseCode}`, status: "PENDING_QC" } });
    const v1 = await prisma.productVersion.create({
      data: { productId: product.id, versionNumber: 1, amisProductId: `amis-v1-${baseCode}`, name: "V1", isCurrent: false },
    });
    const v2 = await prisma.productVersion.create({
      data: { productId: product.id, versionNumber: 2, amisProductId: `amis-v2-${baseCode}`, name: "V2", isCurrent: true },
    });
    await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: v2.id } });
    oldVersionId = v1.id;
    currentVersionId = v2.id;

    const docsOld = await prisma.documentsData.create({ data: { versionId: v1.id } });
    const docsCurrent = await prisma.documentsData.create({ data: { versionId: v2.id } });
    docsOldId = docsOld.id;
    docsCurrentId = docsCurrent.id;

    const oldDoc = await prisma.productDocument.create({
      data: { storageKey: `products/${baseCode}/${v1.id}/old.pdf`, kind: "COA", label: "Old", documentsId: docsOld.id },
    });
    oldDocId = oldDoc.id;

    const currentDoc = await prisma.productDocument.create({
      data: { storageKey: `products/${baseCode}/${v2.id}/current.pdf`, kind: "COA", label: "Current", documentsId: docsCurrent.id },
    });
    currentDocId = currentDoc.id;
  });

  beforeEach(() => vi.clearAllMocks());

  it("trả 403 khi DELETE với QC_STAFF", async () => {
    mockSession(UserRole.QC_STAFF);
    const req = new Request(`http://localhost/api/products/${baseCode}/documents/${currentDocId}`, { method: "DELETE" });
    const res = await DELETE(req, { params: { baseCode, docId: currentDocId } });
    expect(res.status).toBe(403);
  });

  it("DELETE tài liệu thuộc phiên bản KHÔNG phải hiện hành → 404", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/documents/${oldDocId}`, { method: "DELETE" });
    const res = await DELETE(req, { params: { baseCode, docId: oldDocId } });
    expect(res.status).toBe(404);

    // tài liệu của phiên bản cũ vẫn còn nguyên trong DB — không bị xóa nhầm
    const stillThere = await prisma.productDocument.findUnique({ where: { id: oldDocId } });
    expect(stillThere).not.toBeNull();
  });

  it("MANAGER DELETE xóa dòng DB và xóa file thật trên MinIO", async () => {
    mockSession(UserRole.MANAGER);
    const storageKey = buildStorageKey(baseCode, currentVersionId, "delete-me.pdf");
    const uploadUrl = await getUploadUrl({ storageKey, mimeType: "application/pdf", size: 5 });
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf", "Content-Length": "5" },
      body: Buffer.from("hello"),
    });
    expect(putRes.ok).toBe(true);

    const doc = await prisma.productDocument.create({
      data: { storageKey, kind: "COA", label: "Delete me", documentsId: docsCurrentId },
    });

    const req = new Request(`http://localhost/api/products/${baseCode}/documents/${doc.id}`, { method: "DELETE" });
    const res = await DELETE(req, { params: { baseCode, docId: doc.id } });
    expect(res.status).toBe(200);

    const dbRow = await prisma.productDocument.findUnique({ where: { id: doc.id } });
    expect(dbRow).toBeNull();

    const viewUrl = await getViewUrl(storageKey);
    const getRes = await fetch(viewUrl);
    expect(getRes.ok).toBe(false);
  });

  afterAll(async () => {
    await prisma.productDocument.deleteMany({ where: { OR: [{ documentsId: docsCurrentId }, { documentsId: docsOldId }] } });
    await prisma.documentsData.deleteMany({ where: { versionId: { in: [currentVersionId, oldVersionId] } } });
    await prisma.changeLogEntry.deleteMany({ where: { versionId: { in: [currentVersionId, oldVersionId] } } });
    await prisma.productVersion.deleteMany({ where: { id: { in: [currentVersionId, oldVersionId] } } });
    await prisma.product.deleteMany({ where: { baseCode } });
    await prisma.$disconnect();
  });
});
