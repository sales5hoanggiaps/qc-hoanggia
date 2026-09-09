import { prisma } from "@qc/db";
import { fetchAllPages } from "../amis/client";
import { AmisSaleOrder, AmisCustomer } from "../amis/types";
import { upsertProductFromAmis } from "./upsert-product";
import { logger } from "../logger";

export interface RunSyncResult {
  newProducts: number;
  newVersions: number;
  updatedLinks: number;
  syncLogId: string;
}

const YEAR_START = new Date("2026-01-01T00:00:00.000+07:00");
const YEAR_END = new Date("2027-01-01T00:00:00.000+07:00");

export async function runAmisSync(): Promise<RunSyncResult> {
  const syncLog = await prisma.syncLog.create({ data: {} });
  let newProducts = 0;
  let newVersions = 0;
  let updatedLinks = 0;
  let flaggedReview = 0;

  try {
    const [orders, customers] = await Promise.all([
      fetchAllPages<AmisSaleOrder>("/api/v2/SaleOrders?orderBy=modified_date&isDescending=true"),
      fetchAllPages<AmisCustomer>("/api/v2/Customers"),
    ]);

    const ordersIn2026 = orders.filter((o) => {
      if (!o.sale_order_date) return false;
      const d = new Date(o.sale_order_date);
      return d >= YEAR_START && d < YEAR_END;
    });

    const customerByName = new Map(customers.map((c) => [c.account_name, c]));

    for (const order of ordersIn2026) {
      let customerId: string | null = null;
      if (order.account_name) {
        const amisCustomer = customerByName.get(order.account_name);
        const amisCustomerId = amisCustomer ? String(amisCustomer.id) : `name:${order.account_name}`;
        const customer = await prisma.customer.upsert({
          where: { amisCustomerId },
          update: { name: order.account_name },
          create: { amisCustomerId, name: order.account_name },
        });
        customerId = customer.id;
      }

      for (const mapping of order.sale_order_product_mappings ?? []) {
        if (!mapping.product_code) continue;
        const amisProductId = `code:${mapping.product_code}`; // xem "Cannot verify" note trong report Task 4

        const existing = await prisma.product.findUnique({ where: { amisProductId } });
        const result = await upsertProductFromAmis({
          amisProductId,
          code: mapping.product_code,
          name: mapping.description || mapping.product_code,
          description: mapping.description,
        });
        if (result.kind === "created") newProducts++;
        if (result.kind === "new_version") newVersions++;

        if (customerId) {
          const product = await prisma.product.findUnique({ where: { amisProductId } });
          if (product) {
            const orderDate = order.sale_order_date ? new Date(order.sale_order_date) : null;
            const existingLink = await prisma.productCustomer.findUnique({
              where: { productId_customerId: { productId: product.id, customerId } },
            });
            // Đơn hàng được fetch theo thứ tự modified_date giảm dần (không liên quan đến
            // thứ tự sale_order_date), nên không được ghi đè lastOrderDate một cách vô điều
            // kiện — chỉ cập nhật khi ngày của đơn hàng hiện tại mới hơn giá trị đã lưu.
            const lastOrderDate =
              existingLink?.lastOrderDate && orderDate
                ? existingLink.lastOrderDate > orderDate
                  ? existingLink.lastOrderDate
                  : orderDate
                : (orderDate ?? existingLink?.lastOrderDate ?? null);
            await prisma.productCustomer.upsert({
              where: { productId_customerId: { productId: product.id, customerId } },
              update: { lastOrderDate },
              create: {
                productId: product.id,
                customerId,
                lastOrderDate,
              },
            });
            updatedLinks++;
          }
        }

        if (existing && result.kind === "linked_existing" && existing.status !== "PENDING_QC") {
          // Mã đã có nội dung QC, không có phiên bản mới, nhưng tên/mô tả từ đơn hàng gần nhất
          // khác dữ liệu đang lưu — gắn cờ chứ không tự sửa (spec §6 bước 5).
          const currentVersion = await prisma.productVersion.findUnique({
            where: { id: existing.currentVersionId ?? "" },
          });
          if (currentVersion && currentVersion.name !== (mapping.description || mapping.product_code)) {
            flaggedReview++;
          }
        }
      }
    }

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { finishedAt: new Date(), newProducts, updatedLinks, newVersions, flaggedReview },
    });
    logger.info(
      `Đồng bộ AMIS xong: ${newProducts} mã mới, ${newVersions} phiên bản mới, ${updatedLinks} liên kết khách hàng, ${flaggedReview} mã cần xem xét.`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    logger.error("Đồng bộ AMIS thất bại:", message);
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { finishedAt: new Date(), errorMessage: message, newProducts, updatedLinks, newVersions, flaggedReview },
    });
  }

  return { newProducts, newVersions, updatedLinks, syncLogId: syncLog.id };
}
