import { prisma, type ProductStatus } from "@qc/db";

export const PAGE_SIZE = 20;

export interface ListProductsParams {
  categoryId?: string;
  status?: ProductStatus;
  page?: number;
}

export interface ListedProduct {
  baseCode: string;
  name: string;
  categoryName: string | null;
  status: ProductStatus;
}

export interface ListProductsResult {
  items: ListedProduct[];
  page: number;
  totalPages: number;
}

/** Chuẩn hoá số trang đầu vào: bất kỳ giá trị nào không phải số nguyên dương hữu hạn
 * (Infinity, NaN, số âm, 0, số thập phân) đều rơi về trang 1 thay vì lọt xuống Prisma. */
function normalizePage(rawPage: number): number {
  if (!Number.isFinite(rawPage)) return 1;
  const truncated = Math.trunc(rawPage);
  return truncated < 1 ? 1 : truncated;
}

export async function listProducts(params: ListProductsParams): Promise<ListProductsResult> {
  const page = normalizePage(params.page ?? 1);
  const where = {
    ...(params.categoryId ? { categoryId: params.categoryId } : {}),
    ...(params.status ? { status: params.status } : {}),
  };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { category: true, currentVersion: true },
      orderBy: { baseCode: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return {
    items: products.map((p) => ({
      baseCode: p.baseCode,
      name: p.currentVersion?.name ?? "(chưa có tên)",
      categoryName: p.category?.name ?? null,
      status: p.status,
    })),
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}
