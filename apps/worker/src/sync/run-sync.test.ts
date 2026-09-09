import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { prisma } from "@qc/db";
import { __resetTokenCache } from "../amis/client";
import { runAmisSync } from "./run-sync";

const testCode = `TESTRUN${Date.now()}`;

function mockAmisResponses(orders: unknown[], customers: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/v2/Account")) {
        return { ok: true, json: async () => ({ success: true, data: "tok" }) };
      }
      if (url.includes("/api/v2/SaleOrders")) {
        const page = Number(new URL(url, "http://x").searchParams.get("page"));
        return { ok: true, json: async () => ({ success: true, data: page === 0 ? orders : [] }) };
      }
      if (url.includes("/api/v2/Customers")) {
        const page = Number(new URL(url, "http://x").searchParams.get("page"));
        return { ok: true, json: async () => ({ success: true, data: page === 0 ? customers : [] }) };
      }
      throw new Error(`URL không mong đợi trong test: ${url}`);
    })
  );
}

describe("runAmisSync", () => {
  beforeEach(() => __resetTokenCache());

  afterEach(async () => {
    vi.unstubAllGlobals();
    const products = await prisma.product.findMany({ where: { baseCode: { startsWith: "TESTRUN" } } });
    for (const p of products) {
      await prisma.productCustomer.deleteMany({ where: { productId: p.id } });
      await prisma.productVersion.deleteMany({ where: { productId: p.id } });
      await prisma.product.delete({ where: { id: p.id } });
    }
    await prisma.customer.deleteMany({ where: { amisCustomerId: { startsWith: "9999" } } });
  });

  it("tạo mã hàng mới + liên kết khách hàng từ 1 đơn hàng 2026", async () => {
    mockAmisResponses(
      [
        {
          id: 501,
          sale_order_no: "SO-TEST-1",
          account_name: "Khách hàng Test",
          sale_order_date: "2026-05-01T00:00:00.000+07:00",
          modified_date: "2026-05-01T00:00:00.000+07:00",
          organization_unit_name: "Phòng kinh doanh I",
          sale_order_product_mappings: [
            { product_code: testCode, description: "Sản phẩm test run-sync", custom_field3: null },
          ],
        },
      ],
      [{ id: 99991, account_name: "Khách hàng Test" }]
    );

    const result = await runAmisSync();
    expect(result.newProducts).toBe(1);

    const product = await prisma.product.findUnique({ where: { baseCode: testCode } });
    expect(product).not.toBeNull();

    const syncLog = await prisma.syncLog.findUnique({ where: { id: result.syncLogId } });
    expect(syncLog?.newProducts).toBe(1);
    expect(syncLog?.finishedAt).not.toBeNull();
  });

  it("ghi SyncLog với errorMessage và không crash khi AMIS lỗi kết nối", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network unreachable (test)");
    }));

    const result = await runAmisSync();
    const syncLog = await prisma.syncLog.findUnique({ where: { id: result.syncLogId } });
    expect(syncLog?.errorMessage).toContain("network unreachable");
  });
});
