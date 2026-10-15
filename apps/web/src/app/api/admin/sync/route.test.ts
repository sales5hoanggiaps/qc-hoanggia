import { describe, expect, it, vi, beforeEach } from "vitest";
import { UserRole } from "@qc/db";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
import { POST } from "./route";

function mockSession(role: UserRole | null) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    role ? { user: { id: "u1", username: "test", fullName: "Test", role } } : null
  );
}

describe("/api/admin/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SYNC_WORKER_URL = "http://localhost:4100";
    process.env.SYNC_INTERNAL_TOKEN = "test-token";
  });

  it("trả 403 khi chưa đăng nhập", async () => {
    mockSession(null);
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it.each([UserRole.QC_STAFF, UserRole.SALES_STAFF, UserRole.MANAGER, UserRole.ADMIN])(
    "gọi worker và trả về kết quả thành công cho vai trò %s",
    async (role) => {
      mockSession(role);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, json: async () => ({ newProducts: 2, newVersions: 0, updatedLinks: 3 }) }))
      );
      const res = await POST();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.newProducts).toBe(2);
      expect(fetch).toHaveBeenCalledWith(
        "http://localhost:4100/sync",
        expect.objectContaining({ method: "POST", headers: { "x-internal-token": "test-token" } })
      );
      vi.unstubAllGlobals();
    }
  );
});
