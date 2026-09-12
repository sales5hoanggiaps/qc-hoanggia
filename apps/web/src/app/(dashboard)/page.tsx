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
    <main className="p-6">
      <h1 className="text-lg font-semibold">Tìm kiếm mã hàng</h1>
      <form className="mt-4 flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Nhập mã hàng hoặc tên khách hàng..."
          className="w-full max-w-md rounded border px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700">
          Tìm
        </button>
      </form>

      {outcome && (
        <div className="mt-6">
          {outcome.results.length === 0 ? (
            <p className="text-sm text-gray-400">Không tìm thấy kết quả cho &quot;{q}&quot;.</p>
          ) : (
            <ul className="divide-y rounded border text-sm">
              {outcome.results.map((r) => (
                <li key={r.baseCode}>
                  <Link href={`/products/${r.baseCode}`} className="flex items-center justify-between p-3 hover:bg-gray-50">
                    <span>
                      <span className="font-medium">{r.baseCode}</span> — {r.name}
                    </span>
                    {r.customerNames.length > 0 && (
                      <span className="text-xs text-gray-500">{r.customerNames.join(", ")}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
