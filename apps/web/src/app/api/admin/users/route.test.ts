import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";
import { prisma, UserRole } from "@qc/db";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));
import { auth } from "@/lib/auth";
import { GET, POST } from "./route";

function mockSession(role: UserRole | null) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    role ? { user: { id: "u1", username: "test", fullName: "Test", role } } : null
  );
}

describe("/api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET trả 403 khi người gọi không phải ADMIN", async () => {
    mockSession(UserRole.MANAGER);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("GET trả danh sách user khi là ADMIN", async () => {
    mockSession(UserRole.ADMIN);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.users)).toBe(true);
  });

  it("POST tạo user mới với role QC_STAFF khi là ADMIN", async () => {
    mockSession(UserRole.ADMIN);
    const req = new Request("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        fullName: "Nhân viên Test 2",
        username: "test2.qc",
        tempPassword: "TamThoi123!",
        role: "QC_STAFF",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.username).toBe("test2.qc");
    expect(body.user).not.toHaveProperty("passwordHash");
  });

  it("POST trả 403 khi người gọi không phải ADMIN", async () => {
    mockSession(UserRole.QC_STAFF);
    const req = new Request("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        fullName: "X",
        username: "x",
        tempPassword: "12345678",
        role: "QC_STAFF",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: "test2.qc" } });
    await prisma.$disconnect();
  });
});
