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

  it("tạo ProductCustomer cho đơn hàng THỨ HAI khi mã hàng của đơn đó resolve ra CÙNG Product qua nhánh new_version/linked_existing (không phải qua Product.amisProductId của chính mã đó)", async () => {
    // Tái hiện đúng lỗi: run-sync trước đây re-lookup Product bằng
    // `prisma.product.findUnique({ where: { amisProductId } })` dùng
    // amisProductId CỦA CHÍNH mapping hiện tại. Nhưng Product.amisProductId
    // chỉ giữ mã của phiên bản ĐẦU TIÊN (founding), không bao giờ được cập
    // nhật khi có ProductVersion mới. Vì vậy khi đơn hàng thứ 2 dùng 1 mã
    // có hậu tố version (vd "<base>.1") khác với mã đã founding Product (vd
    // "<base>"), amisProductId của đơn hàng thứ 2 KHÔNG khớp Product.amisProductId
    // — re-lookup trả về null — toàn bộ khối tạo ProductCustomer, tăng
    // updatedLinks, và kiểm tra flagged-review cho mapping đó bị bỏ qua âm
    // thầm, không lỗi, không log.
    //
    // Kịch bản test: đơn hàng #1 dùng mã có hậu tố `.1` (founding Product,
    // versionNumber=1 — hậu tố `.N` thật của AMIS, xem Fix 1/version-detection).
    // Đơn hàng #2 (khách hàng khác) dùng mã có hậu tố `.2` của CÙNG gốc đó
    // — upsertProductFromAmis đi vào nhánh "new_version" (tạo ProductVersion
    // #2 của CÙNG Product), trả về result.productId = Product.id gốc — chứ
    // KHÔNG có Product nào có amisProductId trùng với mã của đơn hàng #2.
    // Trước khi fix: ProductCustomer cho khách hàng #2 sẽ KHÔNG được tạo
    // (bug). Sau khi fix: PHẢI được tạo, vì run-sync giờ dùng thẳng
    // result.productId thay vì re-lookup qua amisProductId.
    const versionBaseCode = `TR${String(Date.now()).slice(-6)}`;

    mockAmisResponses(
      [
        {
          id: 701,
          sale_order_no: "SO-TEST-FOUND",
          account_name: "Khách hàng Test A",
          sale_order_date: "2026-04-01T00:00:00.000+07:00",
          modified_date: "2026-04-02T00:00:00.000+07:00",
          organization_unit_name: "Phòng kinh doanh I",
          sale_order_product_mappings: [
            { product_code: `${versionBaseCode}.1`, description: "Sản phẩm test v1", custom_field3: null },
          ],
        },
        {
          id: 702,
          sale_order_no: "SO-TEST-NEWVER",
          account_name: "Khách hàng Test B",
          sale_order_date: "2026-05-01T00:00:00.000+07:00",
          modified_date: "2026-04-01T00:00:00.000+07:00",
          organization_unit_name: "Phòng kinh doanh I",
          sale_order_product_mappings: [
            { product_code: `${versionBaseCode}.2`, description: "Sản phẩm test v2", custom_field3: null },
          ],
        },
      ],
      [
        { id: 99993, account_name: "Khách hàng Test A" },
        { id: 99994, account_name: "Khách hàng Test B" },
      ]
    );

    const result = await runAmisSync();

    const syncLog = await prisma.syncLog.findUnique({ where: { id: result.syncLogId } });
    expect(syncLog?.errorMessage).toBeNull();
    expect(result.newVersions).toBe(1);

    const product = await prisma.product.findUnique({
      where: { baseCode: versionBaseCode },
      include: { currentVersion: true },
    });
    expect(product).not.toBeNull();
    expect(product?.currentVersion?.versionNumber).toBe(2);

    const customerA = await prisma.customer.findUnique({ where: { amisCustomerId: "99993" } });
    const customerB = await prisma.customer.findUnique({ where: { amisCustomerId: "99994" } });
    expect(customerA).not.toBeNull();
    expect(customerB).not.toBeNull();

    const linkA = await prisma.productCustomer.findUnique({
      where: { productId_customerId: { productId: product!.id, customerId: customerA!.id } },
    });
    const linkB = await prisma.productCustomer.findUnique({
      where: { productId_customerId: { productId: product!.id, customerId: customerB!.id } },
    });
    expect(linkA).not.toBeNull();
    // This is the assertion that would have failed before the fix: linkB
    // would be null because the old code's re-lookup by amisProductId (built
    // from the SECOND order's own code, "<base>.1") never matches
    // Product.amisProductId (still the founding "<base>" code).
    expect(linkB).not.toBeNull();

    // Dọn dẹp thủ công: baseCode ("TR......") không bắt đầu bằng "TESTRUN"
    // (bắt buộc vì phải khớp regex parseVersionSuffix cho mã có hậu tố
    // version), nên afterEach chung của file này (lọc theo baseCode
    // startsWith "TESTRUN") không tự dọn được Product/ProductVersion này —
    // phải xoá đúng thứ tự FK ở đây (ChangeLogEntry -> ProductCustomer ->
    // ProductVersion -> Product); Customer được afterEach dọn qua tiền tố
    // amisCustomerId "9999".
    await prisma.changeLogEntry.deleteMany({ where: { version: { productId: product!.id } } });
    await prisma.productCustomer.deleteMany({ where: { productId: product!.id } });
    await prisma.productVersion.deleteMany({ where: { productId: product!.id } });
    await prisma.product.delete({ where: { id: product!.id } });
  });

  it("2 mã khác chữ nhưng parse ra cùng versionNumber (vd .1 và .01) — mã sau bị bỏ qua, tăng duplicateVersionCodes, không tạo thêm ProductVersion", async () => {
    // Tái hiện đúng kịch bản dedup thật (xem upsert-product.ts's existingWithSameNumber, và
    // spec §12): 2 chuỗi mã AMIS khác nhau về mặt chữ ("<base>.1" và "<base>.01") đều khớp
    // regex phiên bản và đều parse ra CÙNG 1 số version (Number("1") === Number("01")) — trước
    // đây bị âm thầm bỏ qua không log/không đếm gì cả; giờ phải tăng duplicateVersionCodes và
    // không được tạo thêm ProductVersion nào từ mã thứ 2.
    const dupBaseCode = `TR${String(Date.now()).slice(-6)}`;

    mockAmisResponses(
      [
        {
          id: 801,
          sale_order_no: "SO-TEST-DUP1",
          account_name: "Khách hàng Test Dup",
          sale_order_date: "2026-04-01T00:00:00.000+07:00",
          modified_date: "2026-04-02T00:00:00.000+07:00",
          organization_unit_name: "Phòng kinh doanh I",
          sale_order_product_mappings: [
            { product_code: `${dupBaseCode}.1`, description: "Sản phẩm test dup v1", custom_field3: null },
          ],
        },
        {
          id: 802,
          sale_order_no: "SO-TEST-DUP2",
          account_name: "Khách hàng Test Dup",
          sale_order_date: "2026-04-15T00:00:00.000+07:00",
          modified_date: "2026-04-01T00:00:00.000+07:00",
          organization_unit_name: "Phòng kinh doanh I",
          sale_order_product_mappings: [
            { product_code: `${dupBaseCode}.01`, description: "Sản phẩm test dup v01 (chữ khác, số version giống)", custom_field3: null },
          ],
        },
      ],
      [{ id: 99995, account_name: "Khách hàng Test Dup" }]
    );

    const result = await runAmisSync();

    const syncLog = await prisma.syncLog.findUnique({ where: { id: result.syncLogId } });
    expect(syncLog?.duplicateVersionCodes).toBe(1);
    expect(syncLog?.errorMessage).toBeNull();

    const product = await prisma.product.findUnique({ where: { baseCode: dupBaseCode }, include: { versions: true } });
    expect(product).not.toBeNull();
    expect(product?.versions).toHaveLength(1); // chỉ ProductVersion từ mã ".1" — mã ".01" không tạo thêm

    // Dọn dẹp thủ công — cùng lý do đã ghi ở test "TR" phía trên (baseCode không khớp tiền tố
    // "TESTRUN" nên afterEach chung của file không tự dọn được).
    await prisma.changeLogEntry.deleteMany({ where: { version: { productId: product!.id } } });
    await prisma.productCustomer.deleteMany({ where: { productId: product!.id } });
    await prisma.productVersion.deleteMany({ where: { productId: product!.id } });
    await prisma.product.delete({ where: { id: product!.id } });
    await prisma.customer.deleteMany({ where: { amisCustomerId: "99995" } });
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
