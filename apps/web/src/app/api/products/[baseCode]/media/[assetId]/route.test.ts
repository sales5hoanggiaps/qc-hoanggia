import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma, UserRole } from "@qc/db";
import { buildStorageKey, getUploadUrl, getViewUrl } from "@qc/storage";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
import { PATCH, DELETE } from "./route";

function mockSession(role: UserRole | null) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    role ? { user: { id: "u1", username: "test", fullName: "Test", role } } : null
  );
}

const baseCode = `MEDAST${Date.now()}`;
let currentVersionId: string;
let oldVersionId: string;
let tcspCurrentId: string;
let tcspOldId: string;
let currentAssetId: string;
let oldAssetId: string;

describe("/api/products/[baseCode]/media/[assetId]", () => {
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

    const tcspOld = await prisma.tCSPData.create({ data: { versionId: v1.id } });
    const tcspCurrent = await prisma.tCSPData.create({ data: { versionId: v2.id } });
    tcspOldId = tcspOld.id;
    tcspCurrentId = tcspCurrent.id;

    const oldAsset = await prisma.mediaAsset.create({
      data: { storageKey: `products/${baseCode}/${v1.id}/old.jpg`, mimeType: "image/jpeg", tcspId: tcspOld.id },
    });
    oldAssetId = oldAsset.id;

    const currentAsset = await prisma.mediaAsset.create({
      data: { storageKey: `products/${baseCode}/${v2.id}/current.jpg`, mimeType: "image/jpeg", tcspId: tcspCurrent.id },
    });
    currentAssetId = currentAsset.id;
  });

  beforeEach(() => vi.clearAllMocks());

  it("trả 403 khi PATCH với QC_STAFF", async () => {
    mockSession(UserRole.QC_STAFF);
    const req = new Request(`http://localhost/api/products/${baseCode}/media/${currentAssetId}`, {
      method: "PATCH",
      body: JSON.stringify({ caption: "x" }),
    });
    const res = await PATCH(req, { params: { baseCode, assetId: currentAssetId } });
    expect(res.status).toBe(403);
  });

  it("trả 403 khi DELETE với QC_STAFF", async () => {
    mockSession(UserRole.QC_STAFF);
    const req = new Request(`http://localhost/api/products/${baseCode}/media/${currentAssetId}`, { method: "DELETE" });
    const res = await DELETE(req, { params: { baseCode, assetId: currentAssetId } });
    expect(res.status).toBe(403);
  });

  it("MANAGER PATCH đổi được caption, và ghi ChangeLogEntry (audit trail)", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/media/${currentAssetId}`, {
      method: "PATCH",
      body: JSON.stringify({ caption: "Ảnh mới" }),
    });
    const res = await PATCH(req, { params: { baseCode, assetId: currentAssetId } });
    expect(res.status).toBe(200);

    const asset = await prisma.mediaAsset.findUnique({ where: { id: currentAssetId } });
    expect(asset?.caption).toBe("Ảnh mới");

    const logs = await prisma.changeLogEntry.findMany({ where: { versionId: currentVersionId, fieldPath: "media.caption" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].newValue).toBe("Ảnh mới");
    expect(logs[0].changedBy).toBe("u1");
  });

  it("PATCH chỉ đổi sortOrder (kéo sắp xếp lại) — KHÔNG ghi ChangeLogEntry, tránh loãng lịch sử", async () => {
    mockSession(UserRole.MANAGER);
    const before = await prisma.changeLogEntry.count({ where: { versionId: currentVersionId, fieldPath: "media.caption" } });

    const req = new Request(`http://localhost/api/products/${baseCode}/media/${currentAssetId}`, {
      method: "PATCH",
      body: JSON.stringify({ sortOrder: 3 }),
    });
    const res = await PATCH(req, { params: { baseCode, assetId: currentAssetId } });
    expect(res.status).toBe(200);

    const asset = await prisma.mediaAsset.findUnique({ where: { id: currentAssetId } });
    expect(asset?.sortOrder).toBe(3);

    const after = await prisma.changeLogEntry.count({ where: { versionId: currentVersionId, fieldPath: "media.caption" } });
    expect(after).toBe(before); // không tăng thêm dòng log nào so với trước khi PATCH sortOrder
  });

  it("PATCH caption giống hệt giá trị cũ — KHÔNG ghi ChangeLogEntry (không phải thay đổi thật)", async () => {
    mockSession(UserRole.MANAGER);
    const noop1 = new Request(`http://localhost/api/products/${baseCode}/media/${currentAssetId}`, {
      method: "PATCH",
      body: JSON.stringify({ caption: "Không đổi gì cả" }),
    });
    await PATCH(noop1, { params: { baseCode, assetId: currentAssetId } });

    const noop2 = new Request(`http://localhost/api/products/${baseCode}/media/${currentAssetId}`, {
      method: "PATCH",
      body: JSON.stringify({ caption: "Không đổi gì cả" }),
    });
    const res = await PATCH(noop2, { params: { baseCode, assetId: currentAssetId } });
    expect(res.status).toBe(200);

    const logs = await prisma.changeLogEntry.findMany({
      where: { versionId: currentVersionId, fieldPath: "media.caption", newValue: "Không đổi gì cả" },
    });
    expect(logs).toHaveLength(1); // chỉ 1 dòng từ lần PATCH ĐẦU (giá trị thật sự đổi), không phải 2
  });

  it("PATCH asset thuộc phiên bản KHÔNG phải hiện hành → 404", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/media/${oldAssetId}`, {
      method: "PATCH",
      body: JSON.stringify({ caption: "x" }),
    });
    const res = await PATCH(req, { params: { baseCode, assetId: oldAssetId } });
    expect(res.status).toBe(404);
  });

  it("DELETE asset thuộc phiên bản KHÔNG phải hiện hành → 404", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/media/${oldAssetId}`, { method: "DELETE" });
    const res = await DELETE(req, { params: { baseCode, assetId: oldAssetId } });
    expect(res.status).toBe(404);

    // asset của phiên bản cũ vẫn còn nguyên trong DB — không bị xóa nhầm
    const stillThere = await prisma.mediaAsset.findUnique({ where: { id: oldAssetId } });
    expect(stillThere).not.toBeNull();
  });

  it("MANAGER DELETE xóa dòng DB và xóa file thật trên MinIO", async () => {
    mockSession(UserRole.MANAGER);
    const storageKey = buildStorageKey(baseCode, currentVersionId, "delete-me.jpg");
    const uploadUrl = await getUploadUrl({ storageKey, mimeType: "image/jpeg", size: 5 });
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "Content-Length": "5" },
      body: Buffer.from("hello"),
    });
    expect(putRes.ok).toBe(true);

    const asset = await prisma.mediaAsset.create({
      data: { storageKey, mimeType: "image/jpeg", tcspId: tcspCurrentId },
    });

    const req = new Request(`http://localhost/api/products/${baseCode}/media/${asset.id}`, { method: "DELETE" });
    const res = await DELETE(req, { params: { baseCode, assetId: asset.id } });
    expect(res.status).toBe(200);

    const dbRow = await prisma.mediaAsset.findUnique({ where: { id: asset.id } });
    expect(dbRow).toBeNull();

    const viewUrl = await getViewUrl(storageKey);
    const getRes = await fetch(viewUrl);
    expect(getRes.ok).toBe(false);
  });

  afterAll(async () => {
    await prisma.mediaAsset.deleteMany({ where: { OR: [{ tcspId: tcspCurrentId }, { tcspId: tcspOldId }] } });
    await prisma.tCSPData.deleteMany({ where: { versionId: { in: [currentVersionId, oldVersionId] } } });
    await prisma.changeLogEntry.deleteMany({ where: { versionId: { in: [currentVersionId, oldVersionId] } } });
    await prisma.productVersion.deleteMany({ where: { id: { in: [currentVersionId, oldVersionId] } } });
    await prisma.product.deleteMany({ where: { baseCode } });
    await prisma.$disconnect();
  });
});
