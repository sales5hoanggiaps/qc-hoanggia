import Link from "next/link";
import { prisma, type ProductStatus } from "@qc/db";
import { listProducts } from "@/lib/products/list-products";

const STATUS_LABELS: Record<ProductStatus, string> = {
  ACTIVE: "Đang hoạt động",
  PENDING_QC: "Chờ bổ sung QC",
  DISCONTINUED: "Ngừng kinh doanh",
};

function isProductStatus(value: string): value is ProductStatus {
  return value in STATUS_LABELS;
}

export default async function ProductListPage({
  searchParams,
}: {
  searchParams: { category?: string; status?: string; page?: string };
}) {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const status = searchParams.status && isProductStatus(searchParams.status) ? searchParams.status : undefined;
  const page = Number(searchParams.page) || 1;

  const result = await listProducts({ categoryId: searchParams.category, status, page });

  function buildHref(overrides: { category?: string; status?: string; page?: string }) {
    const merged = { category: searchParams.category, status: searchParams.status, page: undefined as string | undefined, ...overrides };
    const params = new URLSearchParams();
    if (merged.category) params.set("category", merged.category);
    if (merged.status) params.set("status", merged.status);
    if (merged.page) params.set("page", merged.page);
    const qs = params.toString();
    return qs ? `/danh-sach?${qs}` : "/danh-sach";
  }

  return (
    <main className="p-6">
      <h1 className="text-lg font-semibold">Danh sách mã hàng</h1>

      <form className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <select name="category" defaultValue={searchParams.category ?? ""} className="rounded border px-2 py-1">
          <option value="">Tất cả loại sản phẩm</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="status" defaultValue={searchParams.status ?? ""} className="rounded border px-2 py-1">
          <option value="">Tất cả trạng thái</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button type="submit" className="rounded bg-brand-600 px-3 py-1 text-white hover:bg-brand-700">
          Lọc
        </button>
        <Link href={buildHref({ status: "PENDING_QC", category: undefined })} className="rounded border px-3 py-1 hover:bg-gray-50">
          Chỉ xem PENDING_QC
        </Link>
      </form>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Mã hàng</th>
            <th className="p-2">Tên hàng hoá</th>
            <th className="p-2">Loại sản phẩm</th>
            <th className="p-2">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((item) => (
            <tr key={item.baseCode} className="border-b hover:bg-gray-50">
              <td className="p-2">
                <Link href={`/products/${item.baseCode}`} className="text-brand-600 hover:underline">
                  {item.baseCode}
                </Link>
              </td>
              <td className="p-2">{item.name}</td>
              <td className="p-2">{item.categoryName ?? "—"}</td>
              <td className="p-2">{STATUS_LABELS[item.status]}</td>
            </tr>
          ))}
          {result.items.length === 0 && (
            <tr>
              <td colSpan={4} className="p-2 text-gray-400">Không có mã hàng nào khớp bộ lọc.</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-4 flex items-center gap-3 text-sm">
        <Link
          href={buildHref({ page: String(Math.max(1, result.page - 1)) })}
          className={result.page <= 1 ? "pointer-events-none text-gray-300" : "text-brand-600 hover:underline"}
        >
          « Trước
        </Link>
        <span>Trang {result.page}/{result.totalPages}</span>
        <Link
          href={buildHref({ page: String(Math.min(result.totalPages, result.page + 1)) })}
          className={result.page >= result.totalPages ? "pointer-events-none text-gray-300" : "text-brand-600 hover:underline"}
        >
          Sau »
        </Link>
      </div>
    </main>
  );
}
