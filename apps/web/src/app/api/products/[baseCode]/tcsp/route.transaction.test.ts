import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma, UserRole } from "@qc/db";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/products/change-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/products/change-log")>();
  return {
    ...actual,
    recordChanges: vi.fn(actual.recordChanges),
  };
});

import { auth } from "@/lib/auth";
import { recordChanges } from "@/lib/products/change-log";
import { PATCH } from "./route";

function mockSession(role: UserRole | null) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    role ? { user: { id: "u1", username: "test", fullName: "Test", role } } : null
  );
}

const baseCode = `TCSPTX${Date.now()}`;
let versionId: string;

// Fix 4: TCSPData upsert + xoá/tạo lại specRows + ghi change log phải atomic (1 prisma.$transaction).
// Test này giả lập lỗi xảy ra Ở BƯỚC CUỐI (recordChanges) của lần ghi thứ 2, sau khi các bước
// deleteMany/createMany specRows đã "chạy" trong transaction — nếu code KHÔNG atomic (4 lệnh Prisma
// rời rạc như bug gốc), specRows của lần 1 sẽ đã bị xoá vĩnh viễn trước khi lỗi xảy ra. Với fix đúng
// (bọc trong $transaction), toàn bộ transaction phải rollback và specRows lần 1 phải còn nguyên.
describe("/api/products/[baseCode]/tcsp — Fix 4: ghi atomic trong 1 transaction", () => {
  beforeAll(async () => {
    const product = await prisma.product.create({ data: { baseCode, amisProductId: `amis-${baseCode}`, status: "PENDING_QC" } });
    const version = await prisma.productVersion.create({
      data: { productId: product.id, versionNumber: 1, amisProductId: `amis-v-${baseCode}`, name: "Test", isCurrent: true },
    });
    await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: version.id } });
    versionId = version.id;
  });

  beforeEach(() => vi.clearAllMocks());

  it("nếu lỗi xảy ra giữa chừng lần ghi thứ 2, specRows của lần ghi trước KHÔNG bị mất (rollback toàn bộ)", async () => {
    mockSession(UserRole.MANAGER);

    // Lưu lần 1 thành công — có 1 specRow.
    const req1 = new Request(`http://localhost/api/products/${baseCode}/tcsp`, {
      method: "PATCH",
      body: JSON.stringify({
        description: "Bản gốc",
        specRows: [{ groupName: "Kích thước", criterion: "Dài", value: "10", sortOrder: 0 }],
      }),
    });
    const res1 = await PATCH(req1, { params: { baseCode } });
    expect(res1.status).toBe(200);

    const tcspBefore = await prisma.tCSPData.findUnique({ where: { versionId }, include: { specRows: true } });
    expect(tcspBefore?.specRows).toHaveLength(1);
    const logsBefore = await prisma.changeLogEntry.count({ where: { versionId } });

    // Lần 2: mock recordChanges (bước cuối bên trong transaction) để ném lỗi — giả lập crash
    // giữa chừng, SAU khi deleteMany/createMany specRows đã "thực thi" trong transaction.
    (recordChanges as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));

    const req2 = new Request(`http://localhost/api/products/${baseCode}/tcsp`, {
      method: "PATCH",
      body: JSON.stringify({
        description: "Bản mới — không được phép commit vì lỗi giữa chừng",
        specRows: [{ groupName: "Kích thước", criterion: "Rộng", value: "20", sortOrder: 0 }],
      }),
    });
    await expect(PATCH(req2, { params: { baseCode } })).rejects.toThrow("boom");

    // specRows và description phải giữ nguyên như TRƯỚC lần gọi lỗi — không mất trắng, không nửa vời.
    const tcspAfter = await prisma.tCSPData.findUnique({ where: { versionId }, include: { specRows: true } });
    expect(tcspAfter?.description).toBe("Bản gốc");
    expect(tcspAfter?.specRows).toHaveLength(1);
    expect(tcspAfter?.specRows[0]?.criterion).toBe("Dài");

    // Không có change log nào được ghi thêm từ lần gọi lỗi.
    const logsAfter = await prisma.changeLogEntry.count({ where: { versionId } });
    expect(logsAfter).toBe(logsBefore);
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
