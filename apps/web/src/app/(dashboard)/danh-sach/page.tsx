import Link from "next/link";
import { prisma, type ProductStatus } from "@qc/db";
import { listProducts } from "@/lib/products/list-products";
import { StatusBadge, STATUS_LABELS } from "@/components/ui/StatusBadge";
import { ManualSyncButton } from "@/components/sync/ManualSyncButton";

function isProductStatus(value: string): value is ProductStatus {
  return Object.hasOwn(STATUS_LABELS, value);
}

export default async function ProductListPage({
  searchParams,
}: {
  searchParams: { category?: string; status?: string; filter?: "updated" | "pending" | "new"; page?: string };
}) {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const status = searchParams.status && isProductStatus(searchParams.status) ? searchParams.status : undefined;
  const filter = searchParams.filter;
  const page = Number(searchParams.page) || 1;

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  // Thống kê 4 số liệu trên đầu trang
  const [totalCount, updatedCount, pendingCount, newCount] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({
      where: {
        OR: [
          { status: "ACTIVE" },
          { versions: { some: { changeLogs: { some: { source: "MANUAL" } } } } },
        ],
      },
    }),
    prisma.product.count({
      where: {
        status: "PENDING_QC",
        versions: { none: { changeLogs: { some: { source: "MANUAL" } } } },
      },
    }),
    prisma.product.count({
      where: {
        createdAt: { gte: fourteenDaysAgo },
      },
    }),
  ]);

  const result = await listProducts({ categoryId: searchParams.category, status, filter, page });

  function buildHref(overrides: { category?: string; status?: string; filter?: string; page?: string }) {
    const merged = {
      category: searchParams.category,
      status: searchParams.status,
      filter: searchParams.filter,
      page: undefined as string | undefined,
      ...overrides,
    };
    const params = new URLSearchParams();
    if (merged.category) params.set("category", merged.category);
    if (merged.status) params.set("status", merged.status);
    if (merged.filter) params.set("filter", merged.filter);
    if (merged.page) params.set("page", merged.page);
    const qs = params.toString();
    return qs ? `/danh-sach?${qs}` : "/danh-sach";
  }

  const isAllActive = !filter && !status;
  const isUpdatedActive = filter === "updated";
  const isPendingActive = filter === "pending" || status === "PENDING_QC";
  const isNewActive = filter === "new";

  return (
    <main className="p-6 sm:p-8">
      {/* Tiêu đề & Nút đồng bộ */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Danh sách mã hàng</h1>
          <p className="mt-1 text-sm text-gray-500">Duyệt, lọc và theo dõi tiến độ hoàn thiện hồ sơ QC mã hàng.</p>
        </div>
        <ManualSyncButton />
      </div>

      {/* 4 Thẻ thống kê trực quan trên đầu trang */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {/* Thẻ: Đã cập nhật dữ liệu */}
        <Link
          href={buildHref({ filter: "updated", status: undefined })}
          className={`group relative overflow-hidden rounded-xl border p-4 transition-all duration-150 ${
            isUpdatedActive
              ? "border-emerald-500 bg-emerald-50/70 shadow-md ring-2 ring-emerald-500/20"
              : "border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 shadow-card"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Đã cập nhật</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 group-hover:scale-110 transition-transform">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-800">{updatedCount.toLocaleString("vi-VN")}</div>
          <p className="mt-0.5 text-xs text-emerald-600/80">Đã hoàn thiện QC / TCSP</p>
        </Link>

        {/* Thẻ: Chờ cập nhật */}
        <Link
          href={buildHref({ filter: "pending", status: undefined })}
          className={`group relative overflow-hidden rounded-xl border p-4 transition-all duration-150 ${
            isPendingActive
              ? "border-amber-500 bg-amber-50/70 shadow-md ring-2 ring-amber-500/20"
              : "border-gray-200 bg-white hover:border-amber-300 hover:bg-amber-50/30 shadow-card"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">Chờ cập nhật</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700 group-hover:scale-110 transition-transform">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" strokeLinecap="round" />
              </svg>
            </span>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-amber-800">{pendingCount.toLocaleString("vi-VN")}</div>
          <p className="mt-0.5 text-xs text-amber-600/80">Cần bổ sung tiêu chuẩn & QC</p>
        </Link>

        {/* Thẻ: Mã mới */}
        <Link
          href={buildHref({ filter: "new", status: undefined })}
          className={`group relative overflow-hidden rounded-xl border p-4 transition-all duration-150 ${
            isNewActive
              ? "border-blue-500 bg-blue-50/70 shadow-md ring-2 ring-blue-500/20"
              : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30 shadow-card"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">Mã mới</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700 group-hover:scale-110 transition-transform">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </span>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-blue-800">{newCount.toLocaleString("vi-VN")}</div>
          <p className="mt-0.5 text-xs text-blue-600/80">Mới đồng bộ (14 ngày)</p>
        </Link>

        {/* Thẻ: Tất cả mã hàng */}
        <Link
          href="/danh-sach"
          className={`group relative overflow-hidden rounded-xl border p-4 transition-all duration-150 ${
            isAllActive
              ? "border-indigo-500 bg-indigo-50/70 shadow-md ring-2 ring-indigo-500/20"
              : "border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30 shadow-card"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Tất cả mã</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 group-hover:scale-110 transition-transform">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
            </span>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-indigo-800">{totalCount.toLocaleString("vi-VN")}</div>
          <p className="mt-0.5 text-xs text-indigo-600/80">Toàn bộ mã trên hệ thống</p>
        </Link>
      </div>

      {/* Bảng danh sách & Bộ lọc */}
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
          {(searchParams.category || searchParams.status || searchParams.filter) && (
            <Link
              href="/danh-sach"
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Xoá lọc
            </Link>
          )}
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
            {result.items.map((p) => (
              <tr key={p.baseCode} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-brand-700">
                  <Link href={`/products/${p.baseCode}`} className="hover:underline">
                    {p.baseCode}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-800">{p.name}</td>
                <td className="px-4 py-3 text-gray-500">{p.categoryName ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.status} />
                </td>
              </tr>
            ))}
            {result.items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  Không tìm thấy mã hàng nào phù hợp với bộ lọc hiện tại.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Phân trang */}
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-500">
          <div>Trang {result.page} / {result.totalPages}</div>
          <div className="flex gap-2">
            {result.page > 1 ? (
              <Link
                href={buildHref({ page: String(result.page - 1) })}
                className="rounded-lg border border-gray-300 px-3 py-1 hover:bg-gray-50"
              >
                Trước
              </Link>
            ) : (
              <span className="rounded-lg border border-gray-200 px-3 py-1 text-gray-300">Trước</span>
            )}
            {result.page < result.totalPages ? (
              <Link
                href={buildHref({ page: String(result.page + 1) })}
                className="rounded-lg border border-gray-300 px-3 py-1 hover:bg-gray-50"
              >
                Sau
              </Link>
            ) : (
              <span className="rounded-lg border border-gray-200 px-3 py-1 text-gray-300">Sau</span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
