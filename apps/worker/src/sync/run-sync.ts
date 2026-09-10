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

/** Ném ra khi `runAmisSync()` được gọi trong lúc 1 lượt đồng bộ khác đang chạy (cron hoặc
 * nút "Đồng bộ ngay" gọi chồng nhau) — 1 lượt sync có thể chạy vài phút, và chạy 2 lượt
 * cùng lúc sẽ đua ghi vào cùng dữ liệu, đúng kiểu race gây ra các trạng thái dở dang mà
 * Fix 2 (transaction) đang bảo vệ chống lại. */
export class SyncAlreadyRunningError extends Error {
  constructor() {
    super("Đang có 1 lượt đồng bộ khác đang chạy, vui lòng thử lại sau");
    this.name = "SyncAlreadyRunningError";
  }
}

const YEAR_START = new Date("2026-01-01T00:00:00.000+07:00");
const YEAR_END = new Date("2027-01-01T00:00:00.000+07:00");

// Cờ in-flight ở cấp module — Node đơn luồng nên việc kiểm tra + set cờ này ngay ở đầu hàm,
// trước bất kỳ `await` nào, là an toàn trước race: 2 lệnh gọi runAmisSync() "cùng lúc" vẫn
// luôn chạy phần đồng bộ của lệnh gọi trước cho tới điểm await đầu tiên trước khi lệnh gọi
// sau được thực thi.
let syncInProgress = false;

export function isSyncInProgress(): boolean {
  return syncInProgress;
}

export async function runAmisSync(): Promise<RunSyncResult> {
  if (syncInProgress) {
    throw new SyncAlreadyRunningError();
  }
  syncInProgress = true;
  try {
    return await runAmisSyncInternal();
  } finally {
    syncInProgress = false;
  }
}

async function runAmisSyncInternal(): Promise<RunSyncResult> {
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

        const result = await upsertProductFromAmis({
          amisProductId,
          code: mapping.product_code,
          name: mapping.description || mapping.product_code,
          description: mapping.description,
        });
        if (result.kind === "created") newProducts++;
        if (result.kind === "new_version") newVersions++;

        if (customerId) {
          const orderDate = order.sale_order_date ? new Date(order.sale_order_date) : null;
          const existingLink = await prisma.productCustomer.findUnique({
            where: { productId_customerId: { productId: result.productId, customerId } },
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
            where: { productId_customerId: { productId: result.productId, customerId } },
            update: { lastOrderDate },
            create: {
              productId: result.productId,
              customerId,
              lastOrderDate,
            },
          });
          updatedLinks++;
        }

        if (result.kind === "linked_existing") {
          // Mã đã tồn tại từ trước (không tạo Product/ProductVersion mới trong lần gọi
          // này) — kiểm tra xem tên/mô tả từ đơn hàng gần nhất có khác dữ liệu đang lưu
          // không, để gắn cờ chứ không tự sửa (spec §6 bước 5). Chỉ áp dụng khi Product
          // đã có nội dung QC (không còn PENDING_QC) — mã mới toanh (PENDING_QC) chưa có
          // gì để so sánh/bảo vệ.
          const existingProduct = await prisma.product.findUnique({ where: { id: result.productId } });
          if (existingProduct && existingProduct.status !== "PENDING_QC") {
            const currentVersion = await prisma.productVersion.findUnique({
              where: { id: existingProduct.currentVersionId ?? "" },
            });
            if (currentVersion && currentVersion.name !== (mapping.description || mapping.product_code)) {
              flaggedReview++;
            }
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
