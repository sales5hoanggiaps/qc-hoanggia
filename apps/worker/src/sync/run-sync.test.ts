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

  it("lastOrderDate giữ ngày gần nhất, không bị đơn hàng xử lý sau (nhưng cũ hơn) ghi đè", async () => {
    // Đơn hàng được fetch theo modified_date giảm dần — không liên quan đến sale_order_date.
    // Ở đây đơn có sale_order_date MỚI HƠN được xử lý TRƯỚC, đơn có sale_order_date CŨ HƠN
    // được xử lý SAU, tái hiện đúng kịch bản lỗi: nếu ghi đè vô điều kiện thì giá trị cuối
    // cùng sẽ là ngày cũ (2026-03-01) thay vì ngày mới hơn (2026-08-15).
    mockAmisResponses(
      [
        {
          id: 601,
          sale_order_no: "SO-TEST-NEWER",
          account_name: "Khách hàng Test LastOrderDate",
          sale_order_date: "2026-08-15T00:00:00.000+07:00",
          modified_date: "2026-08-15T00:00:00.000+07:00",
          organization_unit_name: "Phòng kinh doanh I",
          sale_order_product_mappings: [
            { product_code: testCode, description: "Sản phẩm test run-sync", custom_field3: null },
          ],
        },
        {
          id: 602,
          sale_order_no: "SO-TEST-OLDER",
          account_name: "Khách hàng Test LastOrderDate",
          sale_order_date: "2026-03-01T00:00:00.000+07:00",
          modified_date: "2026-01-01T00:00:00.000+07:00",
          organization_unit_name: "Phòng kinh doanh I",
          sale_order_product_mappings: [
            { product_code: testCode, description: "Sản phẩm test run-sync", custom_field3: null },
          ],
        },
      ],
      [{ id: 99992, account_name: "Khách hàng Test LastOrderDate" }]
    );

    await runAmisSync();

    const product = await prisma.product.findUnique({ where: { baseCode: testCode } });
    expect(product).not.toBeNull();
    const customer = await prisma.customer.findUnique({ where: { amisCustomerId: "99992" } });
    expect(customer).not.toBeNull();

    const link = await prisma.productCustomer.findUnique({
      where: { productId_customerId: { productId: product!.id, customerId: customer!.id } },
    });
    expect(link?.lastOrderDate?.toISOString()).toBe(new Date("2026-08-15T00:00:00.000+07:00").toISOString());
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
