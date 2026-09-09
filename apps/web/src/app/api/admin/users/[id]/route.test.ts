import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { prisma, UserRole } from "@qc/db";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
import { PATCH } from "./route";

function mockSession(role: UserRole | null) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    role ? { user: { id: "u1", username: "test", fullName: "Test", role } } : null
  );
}

let adminTargetId: string;
let staffTargetId: string;

describe("/api/admin/users/[id]", () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("TamThoi123!", 10);

    const adminTarget = await prisma.user.create({
      data: {
        fullName: "Admin Test Target",
        username: "admin-target.test",
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
      },
    });
    adminTargetId = adminTarget.id;

    const staffTarget = await prisma.user.create({
      data: {
        fullName: "Staff Test Target",
        username: "staff-target.test",
        passwordHash,
        role: UserRole.QC_STAFF,
        isActive: true,
      },
    });
    staffTargetId = staffTarget.id;
  });

  beforeEach(() => vi.clearAllMocks());

  it("PATCH nhắm vào tài khoản ADMIN trả 400 và không đổi bản ghi, kể cả khi người gọi là ADMIN", async () => {
    mockSession(UserRole.ADMIN);
    const req = new Request(`http://localhost/api/admin/users/${adminTargetId}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: false }),
    });
    const res = await PATCH(req, { params: { id: adminTargetId } });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("Không thể thay đổi tài khoản Admin qua API này");

    const unchanged = await prisma.user.findUnique({ where: { id: adminTargetId } });
    expect(unchanged?.isActive).toBe(true);
    expect(unchanged?.role).toBe(UserRole.ADMIN);
  });

  it("PATCH nhắm vào tài khoản không phải ADMIN vẫn hoạt động như cũ (đổi isActive)", async () => {
    mockSession(UserRole.ADMIN);
    const req = new Request(`http://localhost/api/admin/users/${staffTargetId}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: false }),
    });
    const res = await PATCH(req, { params: { id: staffTargetId } });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.user.isActive).toBe(false);

    const changed = await prisma.user.findUnique({ where: { id: staffTargetId } });
    expect(changed?.isActive).toBe(false);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { username: { in: ["admin-target.test", "staff-target.test"] } },
    });
    await prisma.$disconnect();
  });
});
