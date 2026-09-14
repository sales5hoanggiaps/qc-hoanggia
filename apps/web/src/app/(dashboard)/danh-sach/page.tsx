import Link from "next/link";
import { prisma, type ProductStatus } from "@qc/db";
import { listProducts } from "@/lib/products/list-products";
import { StatusBadge, STATUS_LABELS } from "@/components/ui/StatusBadge";

function isProductStatus(value: string): value is ProductStatus {
  return Object.hasOwn(STATUS_LABELS, value);
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
    <main className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Danh sách mã hàng</h1>
        <p className="mt-1 text-sm text-gray-500">Duyệt và lọc toàn bộ mã hàng đã đồng bộ từ AMIS.</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-card">
        <form className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-4">
          <select
            name="category"
            defaultValue={searchParams.category ?? ""}
            className="rounded-lg border-gray-300 py-1.5 text-sm text-gray-700 focus:border-brand-500 focus:ring-brand-500"
          >
            <option value="">Tất cả loại sản phẩm</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={searchParams.status ?? ""}
            className="rounded-lg border-gray-300 py-1.5 text-sm text-gray-700 focus:border-brand-500 focus:ring-brand-500"
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            Lọc
          </button>
          <Link
            href={buildHref({ status: "PENDING_QC", category: undefined })}
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100"
          >
            Chỉ xem PENDING_QC
          </Link>
        </form>

        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 font-medium">Mã hàng</th>
              <th className="px-4 py-3 font-medium">Tên hàng hoá</th>
              <th className="px-4 py-3 font-medium">Loại sản phẩm</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {result.items.map((item) => (
              <tr key={item.baseCode} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/products/${item.baseCode}`} className="font-medium text-brand-600 hover:underline">
                    {item.baseCode}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-700">{item.name}</td>
                <td className="px-4 py-3 text-gray-500">{item.categoryName ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={item.status} />
                </td>
              </tr>
            ))}
            {result.items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">Không có mã hàng nào khớp bộ lọc.</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-500">
          <span>Trang {result.page}/{result.totalPages}</span>
          <div className="flex gap-2">
            <Link
              href={buildHref({ page: String(Math.max(1, result.page - 1)) })}
              className={`rounded-lg border px-3 py-1.5 ${
                result.page <= 1 ? "pointer-events-none border-gray-100 text-gray-300" : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              « Trước
            </Link>
            <Link
              href={buildHref({ page: String(Math.min(result.totalPages, result.page + 1)) })}
              className={`rounded-lg border px-3 py-1.5 ${
                result.page >= result.totalPages ? "pointer-events-none border-gray-100 text-gray-300" : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              Sau »
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
