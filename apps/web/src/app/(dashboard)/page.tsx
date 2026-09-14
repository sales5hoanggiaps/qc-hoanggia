import Link from "next/link";
import { redirect } from "next/navigation";
import { searchProducts } from "@/lib/products/search-products";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = searchParams.q ?? "";
  const outcome = q.trim() ? await searchProducts(q) : null;
  if (outcome?.redirectTo) redirect(outcome.redirectTo);

  return (
    <main className="flex min-h-full flex-col items-center px-6 py-16">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Tìm kiếm mã hàng</h1>
          <p className="mt-2 text-sm text-gray-500">Tra cứu theo mã hàng (kể cả mã có phiên bản, vd SI08694.1) hoặc tên khách hàng.</p>
        </div>

        <form className="relative">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Nhập mã hàng hoặc tên khách hàng..."
            autoFocus
            className="w-full rounded-xl border border-gray-300 py-3.5 pl-12 pr-28 text-sm shadow-card focus:border-brand-500 focus:ring-brand-500"
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Tìm
          </button>
        </form>

        {outcome && (
          <div className="mt-8">
            {outcome.results.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center">
                <p className="text-sm text-gray-400">Không tìm thấy kết quả cho &quot;{q}&quot;.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
                <ul className="divide-y divide-gray-100 text-sm">
                  {outcome.results.map((r) => (
                    <li key={r.baseCode}>
                      <Link href={`/products/${r.baseCode}`} className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50">
                        <span>
                          <span className="font-medium text-brand-700">{r.baseCode}</span>
                          <span className="text-gray-600"> — {r.name}</span>
                        </span>
                        {r.customerNames.length > 0 && (
                          <span className="ml-4 shrink-0 text-xs text-gray-400">{r.customerNames.join(", ")}</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
