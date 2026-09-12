import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { prisma, UserRole } from "@qc/db";
import ExcelJS from "exceljs";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
import { GET } from "./route";

function mockSession(role: UserRole | null) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    role ? { user: { id: "u1", username: "test", fullName: "Test", role } } : null
  );
}

const baseCode = `TCSPXP${Date.now()}`;
let oldVersionNumber: number;

describe("/api/products/[baseCode]/tcsp/export", () => {
  beforeAll(async () => {
    const product = await prisma.product.create({ data: { baseCode, amisProductId: `amis-${baseCode}`, status: "PENDING_QC" } });
    const v1 = await prisma.productVersion.create({
      data: { productId: product.id, versionNumber: 1, amisProductId: `amis-v1-${baseCode}`, name: "Test export v1", isCurrent: false },
    });
    await prisma.tCSPData.create({ data: { versionId: v1.id, description: "Mô tả v1", materialCode: "NL-OLD" } });
    oldVersionNumber = v1.versionNumber;

    const v2 = await prisma.productVersion.create({
      data: { productId: product.id, versionNumber: 2, amisProductId: `amis-v2-${baseCode}`, name: "Test export v2", isCurrent: true },
    });
    await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: v2.id } });
    await prisma.tCSPData.create({ data: { versionId: v2.id, description: "Mô tả xuất thử", materialCode: "NL-X" } });
  });

  it("trả 403 khi chưa đăng nhập", async () => {
    mockSession(null);
    const res = await GET(new Request(`http://localhost/api/products/${baseCode}/tcsp/export`), { params: { baseCode } });
    expect(res.status).toBe(403);
  });

  it.each([UserRole.QC_STAFF, UserRole.MANAGER, UserRole.ADMIN])(
    "%s tải được (quyền đọc/xuất, không giới hạn như quyền sửa)",
    async (role) => {
      mockSession(role);
      const res = await GET(new Request(`http://localhost/api/products/${baseCode}/tcsp/export`), { params: { baseCode } });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("spreadsheetml");

      const buffer = Buffer.from(await res.arrayBuffer());
      const wb = new ExcelJS.Workbook();
      // exceljs's .d.ts resolves "Buffer" via a different @types/node than this project's — same
      // issue documented in build-workbook.test.ts's readBack helper.
      await wb.xlsx.load(buffer as any);
      const sheet = wb.getWorksheet("TCSP")!;
      expect(sheet.getCell("B6").value).toBe("NL-X");
    }
  );

  it("?version=N trả đúng dữ liệu của phiên bản cũ, không phải phiên bản hiện hành", async () => {
    mockSession(UserRole.QC_STAFF);
    const res = await GET(
      new Request(`http://localhost/api/products/${baseCode}/tcsp/export?version=${oldVersionNumber}`),
      { params: { baseCode } }
    );
    expect(res.status).toBe(200);
    const buffer = Buffer.from(await res.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const sheet = wb.getWorksheet("TCSP")!;
    expect(sheet.getCell("B6").value).toBe("NL-OLD");
  });

  it("trả 404 khi mã hàng không tồn tại", async () => {
    mockSession(UserRole.QC_STAFF);
    const res = await GET(new Request(`http://localhost/api/products/KHONGTONTAI/tcsp/export`), { params: { baseCode: "KHONGTONTAI" } });
    expect(res.status).toBe(404);
  });

  it("trả 404 khi ?version=N không tồn tại", async () => {
    mockSession(UserRole.QC_STAFF);
    const res = await GET(new Request(`http://localhost/api/products/${baseCode}/tcsp/export?version=999`), { params: { baseCode } });
    expect(res.status).toBe(404);
  });

  afterAll(async () => {
    await prisma.tCSPData.deleteMany({ where: { version: { product: { baseCode } } } });
    await prisma.productVersion.deleteMany({ where: { product: { baseCode } } });
    await prisma.product.deleteMany({ where: { baseCode } });
    await prisma.$disconnect();
  });
});
