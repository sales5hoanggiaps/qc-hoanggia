/**
 * Integration tests for /api/admin/categories endpoint.
 * Requires DATABASE_URL environment variable sourced from infra/.env.
 * Run with: set -a && source infra/.env && set +a && npm run test --workspace=apps/web
 */

import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";
import { prisma, UserRole } from "@qc/db";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
import { GET, POST } from "./route";

function mockSession(role: UserRole | null) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    role ? { user: { id: "u1", username: "test", fullName: "Test", role } } : null
  );
}

describe("/api/admin/categories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET trả 403 khi là QC_STAFF", async () => {
    mockSession(UserRole.QC_STAFF);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("GET trả danh sách khi là MANAGER", async () => {
    mockSession(UserRole.MANAGER);
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("POST tạo danh mục mới khi là MANAGER", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request("http://localhost/api/admin/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Nhãn co (test)" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.category.name).toBe("Nhãn co (test)");
  });

  afterAll(async () => {
    await prisma.category.deleteMany({ where: { name: "Nhãn co (test)" } });
    await prisma.$disconnect();
  });
});
