// apps/worker/src/amis/client.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getAmisToken, fetchAllPages, __resetTokenCache } from "./client";

describe("getAmisToken", () => {
  beforeEach(() => {
    __resetTokenCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: true, data: "fake-token-123" }),
      }))
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("gọi POST /api/v2/Account với client_id/client_secret và trả về token", async () => {
    const token = await getAmisToken();
    expect(token).toBe("fake-token-123");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v2/Account"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("dùng lại token đã cache thay vì gọi lại Account API", async () => {
    await getAmisToken();
    await getAmisToken();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("ném lỗi rõ ràng khi xác thực thất bại", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ success: false, user_msg: "Sai AppID" }),
      }))
    );
    __resetTokenCache();
    await expect(getAmisToken()).rejects.toThrow(/Sai AppID/);
  });
});

describe("fetchAllPages", () => {
  beforeEach(() => __resetTokenCache());
  afterEach(() => vi.unstubAllGlobals());

  it("dừng phân trang khi 1 trang trả về ít hơn pageSize", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/v2/Account")) {
          return { ok: true, json: async () => ({ success: true, data: "tok" }) };
        }
        call++;
        const page = call === 1 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }];
        return { ok: true, json: async () => ({ success: true, data: page }) };
      })
    );

    const rows = await fetchAllPages<{ id: number }>("/api/v2/Products", 2);
    expect(rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });
});
