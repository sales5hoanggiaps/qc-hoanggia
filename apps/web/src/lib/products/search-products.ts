import { prisma } from "@qc/db";
import { parseVersionSuffix } from "./parse-version-suffix";

export interface SearchResultItem {
  baseCode: string;
  name: string;
  customerNames: string[];
}

export interface SearchOutcome {
  /** Khi khác null, caller (trang chủ) phải `redirect()` thẳng tới đây — không hiển thị danh sách. */
  redirectTo: string | null;
  results: SearchResultItem[];
}

/** Giới hạn số kết quả hiển thị trên trang chủ — trang Danh sách mã hàng (/danh-sach) có phân
 * trang thật cho việc duyệt/lọc số lượng lớn; ô tìm kiếm trang chủ chỉ cần đủ dùng cho tra cứu
 * nhanh, không cần phân trang riêng. */
const MAX_RESULTS = 50;

export async function searchProducts(rawQuery: string): Promise<SearchOutcome> {
  const q = rawQuery.trim();
  if (!q) return { redirectTo: null, results: [] };

  const parsed = parseVersionSuffix(q);
  if (parsed) {
    const product = await prisma.product.findUnique({ where: { baseCode: parsed.baseCode } });
    if (product) {
      const version = await prisma.productVersion.findFirst({
        where: { productId: product.id, versionNumber: parsed.versionNumber },
      });
      if (version) {
        const redirectTo = version.isCurrent
          ? `/products/${product.baseCode}`
          : `/products/${product.baseCode}/v/${version.versionNumber}`;
        return { redirectTo, results: [] };
      }
    }
    // Không tìm thấy đúng phiên bản đó (vd gõ nhầm số version) — rơi xuống tìm gần đúng bên
    // dưới bằng nguyên chuỗi gõ vào, không coi đây là lỗi.
  }

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { baseCode: { contains: q, mode: "insensitive" } },
        { customers: { some: { customer: { name: { contains: q, mode: "insensitive" } } } } },
      ],
    },
    include: { currentVersion: true, customers: { include: { customer: true } } },
    take: MAX_RESULTS,
    orderBy: { baseCode: "asc" },
  });

  return {
    redirectTo: null,
    results: products.map((p) => ({
      baseCode: p.baseCode,
      name: p.currentVersion?.name ?? "(chưa có tên)",
      customerNames: p.customers.map((c) => c.customer.name),
    })),
  };
}
