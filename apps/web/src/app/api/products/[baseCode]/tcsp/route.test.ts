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
