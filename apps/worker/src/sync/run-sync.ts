import { prisma } from "@qc/db";
import { fetchAllPages } from "../amis/client";
import { AmisSaleOrder, AmisCustomer } from "../amis/types";
import { upsertProductFromAmis } from "./upsert-product";
import { parseVersionSuffix } from "./version-detection";
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
  let duplicateVersionCodes = 0;

  try {
    const [orders, customers] = await Promise.all([
      fetchAllPages<AmisSaleOrder>("/api/v2/SaleOrders?orderBy=modified_date&isDescending=true"),
      fetchAllPages<AmisCustomer>("/api/v2/Customers"),
    ]);

    // Chỉ lấy những mã đã bán của năm 2026
    const ordersInPeriod = orders.filter((o) => {
      if (!o.sale_order_date) return false;
      const d = new Date(o.sale_order_date);
      return d >= YEAR_START && d < YEAR_END;
    });

    const customerByName = new Map(customers.map((c) => [c.account_name, c]));

    // 1. Thu thập phiên bản cao nhất (mới nhất) cho mỗi mã gốc (baseCode) trong toàn bộ đơn hàng 2026.
    // Những mã có nhiều phiên bản thì chỉ lấy phiên bản mới nhất.
    const maxVersionByBaseCode = new Map<string, number>();
    for (const order of ordersInPeriod) {
      for (const mapping of order.sale_order_product_mappings ?? []) {
        if (!mapping.product_code) continue;
        const parsed = parseVersionSuffix(mapping.product_code);
        const baseCode = parsed ? parsed.baseCode : mapping.product_code;
        const versionNumber = parsed ? parsed.versionNumber : 1;
        const currentMax = maxVersionByBaseCode.get(baseCode) ?? 0;
        if (versionNumber > currentMax) {
          maxVersionByBaseCode.set(baseCode, versionNumber);
        }
      }
    }

    // 2. Đồng bộ sản phẩm theo các mã đạt phiên bản mới nhất
    const productIdByBaseCode = new Map<string, string>();

    for (const order of ordersInPeriod) {
      for (const mapping of order.sale_order_product_mappings ?? []) {
        if (!mapping.product_code) continue;
        const parsed = parseVersionSuffix(mapping.product_code);
        const baseCode = parsed ? parsed.baseCode : mapping.product_code;
        const versionNumber = parsed ? parsed.versionNumber : 1;
        const maxVersion = maxVersionByBaseCode.get(baseCode) ?? 1;

        // Bỏ qua nếu mã này cũ hơn phiên bản mới nhất của baseCode trong giai đoạn 2026
        if (versionNumber < maxVersion) {
          continue;
        }

        const amisProductId = `code:${mapping.product_code}`;

        const result = await upsertProductFromAmis({
          amisProductId,
          code: mapping.product_code,
          name: mapping.description || mapping.product_code,
          description: mapping.description,
        });

        productIdByBaseCode.set(baseCode, result.productId);
        if (result.kind === "created") newProducts++;
        if (result.kind === "new_version") newVersions++;
        if (result.kind === "linked_existing" && result.duplicateVersionNumber) duplicateVersionCodes++;

        if (result.kind === "linked_existing") {
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

    // 3. Quét các đơn hàng để liên kết khách hàng & thu thập mô tả chi tiết gần nhất
    const latestOrderDescByProductId = new Map<string, { date: Date; description: string }>();

    for (const order of ordersInPeriod) {
      const orderDate = order.sale_order_date ? new Date(order.sale_order_date) : null;
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
        const parsed = parseVersionSuffix(mapping.product_code);
        const baseCode = parsed ? parsed.baseCode : mapping.product_code;
        const productId = productIdByBaseCode.get(baseCode);
        if (!productId) continue;

        if (orderDate && mapping.custom_field5) {
          const prevBest = latestOrderDescByProductId.get(productId);
          if (!prevBest || orderDate > prevBest.date) {
            latestOrderDescByProductId.set(productId, { date: orderDate, description: mapping.custom_field5 });
          }
        }

        if (customerId) {
          const existingLink = await prisma.productCustomer.findUnique({
            where: { productId_customerId: { productId, customerId } },
          });
          const lastOrderDate =
            existingLink?.lastOrderDate && orderDate
              ? existingLink.lastOrderDate > orderDate
                ? existingLink.lastOrderDate
                : orderDate
              : (orderDate ?? existingLink?.lastOrderDate ?? null);
          await prisma.productCustomer.upsert({
            where: { productId_customerId: { productId, customerId } },
            update: { lastOrderDate },
            create: {
              productId,
              customerId,
              lastOrderDate,
            },
          });
          updatedLinks++;
        }
      }
    }

    // Áp dụng Mô tả gom được ở trên vào TCSPData.description của phiên bản hiện hành — luôn ghi
    // đè kể cả khi QC đã tự sửa tay (đã xác nhận: Mô tả phải luôn phản ánh đúng đơn hàng gần
    // nhất), nhưng ghi ChangeLogEntry (nguồn AMIS_SYNC) để vẫn xem lại được ở tab Lịch sử phiên
    // bản. Bỏ qua khi giá trị không đổi, tránh log rác mỗi lần sync.
    for (const [productId, latest] of latestOrderDescByProductId) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: { currentVersion: { include: { tcsp: true } } },
      });
      const currentVersion = product?.currentVersion;
      if (!currentVersion) continue;

      const oldDescription = currentVersion.tcsp?.description ?? null;
      if (oldDescription === latest.description) continue;

      await prisma.tCSPData.upsert({
        where: { versionId: currentVersion.id },
        update: { description: latest.description },
        create: { versionId: currentVersion.id, description: latest.description },
      });
      await prisma.changeLogEntry.create({
        data: {
          versionId: currentVersion.id,
          fieldPath: "description",
          oldValue: oldDescription,
          newValue: latest.description,
          source: "AMIS_SYNC",
        },
      });
    }

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { finishedAt: new Date(), newProducts, updatedLinks, newVersions, flaggedReview, duplicateVersionCodes },
    });
    logger.info(
      `Đồng bộ AMIS xong: ${newProducts} mã mới, ${newVersions} phiên bản mới, ${updatedLinks} liên kết khách hàng, ${flaggedReview} mã cần xem xét, ${duplicateVersionCodes} mã trùng versionNumber bị bỏ qua.`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    logger.error("Đồng bộ AMIS thất bại:", message);
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { finishedAt: new Date(), errorMessage: message, newProducts, updatedLinks, newVersions, flaggedReview, duplicateVersionCodes },
    });
  }

  return { newProducts, newVersions, updatedLinks, syncLogId: syncLog.id };
}
