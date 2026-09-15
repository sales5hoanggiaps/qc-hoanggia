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

const baseCode = `TCSPRT${Date.now()}`;
let versionId: string;

describe("/api/products/[baseCode]/tcsp", () => {
  beforeAll(async () => {
    const product = await prisma.product.create({
      data: { baseCode, amisProductId: `amis-${baseCode}`, status: "PENDING_QC" },
    });
    const version = await prisma.productVersion.create({
      data: { productId: product.id, versionNumber: 1, amisProductId: `amis-v-${baseCode}`, name: "Test", isCurrent: true },
    });
    await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: version.id } });
    versionId = version.id;
  });

  beforeEach(() => vi.clearAllMocks());

  it("trả 403 khi là QC_STAFF", async () => {
    mockSession(UserRole.QC_STAFF);
    const req = new Request(`http://localhost/api/products/${baseCode}/tcsp`, {
      method: "PATCH",
      body: JSON.stringify({ description: "x", specRows: [] }),
    });
    const res = await PATCH(req, { params: { baseCode } });
    expect(res.status).toBe(403);
  });

  it("MANAGER lưu được, tạo TCSPData mới nếu chưa có, và ghi ChangeLogEntry", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/tcsp`, {
      method: "PATCH",
      body: JSON.stringify({
        materialCode: "NL001",
        description: "Màng OPP 2 lớp",
        preparedBy: "Quân",
        approvedBy: null,
        approvedAt: null,
        specRows: [{ groupName: "Kích thước", criterion: "Chiều dài", value: "1000", tolerance: "±1", unit: "m", note: "", sortOrder: 0 }],
      }),
    });
    const res = await PATCH(req, { params: { baseCode } });
    expect(res.status).toBe(200);

    const tcsp = await prisma.tCSPData.findUnique({ where: { versionId }, include: { specRows: true } });
    expect(tcsp?.description).toBe("Màng OPP 2 lớp");
    expect(tcsp?.specRows).toHaveLength(1);

    const logs = await prisma.changeLogEntry.findMany({ where: { versionId } });
    expect(logs.some((l) => l.fieldPath === "description" && l.newValue === "Màng OPP 2 lớp")).toBe(true);
    // Fix 1 (a): lần lưu đầu tiên có specRows phải ghi log specRows thực sự (không bị bỏ sót).
    const specRowLog = logs.find((l) => l.fieldPath === "specRows");
    expect(specRowLog).toBeDefined();
    expect(specRowLog?.oldValue).toBeNull();
    expect(specRowLog?.newValue).toBe("1 dòng");
  });

  it("Fix 1 (b): lặp lại đúng y hệt lần lưu trước thì KHÔNG ghi log specRows giả", async () => {
    mockSession(UserRole.MANAGER);
    const body = JSON.stringify({
      materialCode: "NL001",
      description: "Màng OPP 2 lớp",
      preparedBy: "Quân",
      approvedBy: null,
      approvedAt: null,
      specRows: [{ groupName: "Kích thước", criterion: "Chiều dài", value: "1000", tolerance: "±1", unit: "m", note: "", sortOrder: 0 }],
    });
    const logsBefore = await prisma.changeLogEntry.count({ where: { versionId } });

    const req = new Request(`http://localhost/api/products/${baseCode}/tcsp`, { method: "PATCH", body });
    const res = await PATCH(req, { params: { baseCode } });
    expect(res.status).toBe(200);

    const logsAfter = await prisma.changeLogEntry.findMany({ where: { versionId } });
    expect(logsAfter).toHaveLength(logsBefore); // không thêm dòng log nào, kể cả 1 dòng specRows giả
  });

  it("Fix 1 (c): thực sự đổi specRows thì ghi log đúng oldValue/newValue", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/tcsp`, {
      method: "PATCH",
      body: JSON.stringify({
        materialCode: "NL001",
        description: "Màng OPP 2 lớp",
        preparedBy: "Quân",
        approvedBy: null,
        approvedAt: null,
        specRows: [
          { groupName: "Kích thước", criterion: "Chiều dài", value: "1000", tolerance: "±1", unit: "m", note: "", sortOrder: 0 },
          { groupName: "Kích thước", criterion: "Chiều rộng", value: "500", tolerance: "±1", unit: "m", note: "", sortOrder: 1 },
        ],
      }),
    });
    const res = await PATCH(req, { params: { baseCode } });
    expect(res.status).toBe(200);

    const logs = await prisma.changeLogEntry.findMany({ where: { versionId } });
    const specRowLogs = logs.filter((l) => l.fieldPath === "specRows");
    expect(specRowLogs).toHaveLength(2); // 1 từ lần lưu đầu (test trước) + 1 từ lần này
    const latest = specRowLogs[specRowLogs.length - 1];
    expect(latest.oldValue).toBe("1 dòng");
    expect(latest.newValue).toBe("2 dòng");
  });

  it("Fix 3: approvedAt không hợp lệ trả 400 thay vì crash 500", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/tcsp`, {
      method: "PATCH",
      body: JSON.stringify({
        materialCode: "NL001",
        description: "x",
        approvedAt: "không-phải-ngày",
        specRows: [],
      }),
    });
    const res = await PATCH(req, { params: { baseCode } });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(JSON.stringify(json)).toContain("Ngày duyệt không hợp lệ");
  });

  it("Fix 3: approvedAt hợp lệ vẫn lưu được bình thường", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/tcsp`, {
      method: "PATCH",
      body: JSON.stringify({
        materialCode: "NL001",
        description: "Màng OPP 2 lớp",
        approvedAt: "2026-01-15",
        specRows: [],
      }),
    });
    const res = await PATCH(req, { params: { baseCode } });
    expect(res.status).toBe(200);
    const tcsp = await prisma.tCSPData.findUnique({ where: { versionId } });
    expect(tcsp?.approvedAt?.toISOString().slice(0, 10)).toBe("2026-01-15");
  });

  it("MANAGER chọn Nhóm sản phẩm + Loại sản phẩm — lưu vào Product và ghi ChangeLogEntry", async () => {
    mockSession(UserRole.MANAGER);
    const category = await prisma.category.create({ data: { name: `Loại test ${baseCode}` } });

    const req = new Request(`http://localhost/api/products/${baseCode}/tcsp`, {
      method: "PATCH",
      body: JSON.stringify({
        materialCode: "NL001",
        description: "Màng OPP 2 lớp",
        specRows: [],
        productGroup: "SAN_XUAT",
        categoryId: category.id,
      }),
    });
    const res = await PATCH(req, { params: { baseCode } });
    expect(res.status).toBe(200);

    const product = await prisma.product.findUnique({ where: { baseCode } });
    expect(product?.productGroup).toBe("SAN_XUAT");
    expect(product?.categoryId).toBe(category.id);

    const logs = await prisma.changeLogEntry.findMany({ where: { versionId } });
    expect(logs.some((l) => l.fieldPath === "productGroup" && l.newValue === "Sản xuất")).toBe(true);
    expect(logs.some((l) => l.fieldPath === "category" && l.newValue === category.name)).toBe(true);

    await prisma.product.update({ where: { baseCode }, data: { categoryId: null } });
    await prisma.category.delete({ where: { id: category.id } });
  });

  it("categoryId không tồn tại trả 400, không đụng vào Product", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/tcsp`, {
      method: "PATCH",
      body: JSON.stringify({ description: "x", specRows: [], categoryId: "khong-ton-tai" }),
    });
    const res = await PATCH(req, { params: { baseCode } });
    expect(res.status).toBe(400);
  });

  afterAll(async () => {
    const tcsp = await prisma.tCSPData.findUnique({ where: { versionId } });
    if (tcsp) {
      await prisma.tCSPSpecRow.deleteMany({ where: { tcspId: tcsp.id } });
      await prisma.tCSPData.delete({ where: { id: tcsp.id } });
    }
    await prisma.changeLogEntry.deleteMany({ where: { versionId } });
    await prisma.productVersion.deleteMany({ where: { id: versionId } });
    await prisma.product.deleteMany({ where: { baseCode } });
    await prisma.$disconnect();
  });
});
