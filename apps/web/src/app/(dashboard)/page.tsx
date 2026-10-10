import Link from "next/link";
import { redirect } from "next/navigation";
import { Manrope } from "next/font/google";
import { prisma } from "@qc/db";
import { searchProducts } from "@/lib/products/search-products";

// Chỉ trang chủ dùng Manrope cho tiêu đề/số liệu nổi bật (thay vì Inter mặc định của cả app) —
// tự host qua next/font/google như Inter ở layout gốc, không gọi CDN lúc chạy.
const manrope = Manrope({ subsets: ["latin", "vietnamese", "latin-ext"], weight: ["700", "800"], variable: "--font-manrope" });

export default async function HomePage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = searchParams.q ?? "";

  // Chạy song song với tìm kiếm — 3 số liệu này luôn cần hiển thị ở dải thẻ tròn dưới banner,
  // kể cả khi sắp redirect do khớp đúng 1 mã hàng (lãng phí không đáng kể, đổi lấy code đơn giản).
  const [outcome, activeCount, pendingCount, lastSync] = await Promise.all([
    q.trim() ? searchProducts(q) : Promise.resolve(null),
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.product.count({ where: { status: "PENDING_QC" } }),
    prisma.syncLog.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
  ]);
  if (outcome?.redirectTo) redirect(outcome.redirectTo);

  const lastSyncLabel = lastSync
    ? new Date(lastSync.startedAt).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "Chưa đồng bộ";

  const stats = [
    { value: String(activeCount), label: "Đang hoạt động", tone: "light" as const },
    { value: String(pendingCount), label: "Chờ bổ sung QC", tone: "dark" as const },
    { value: lastSyncLabel, label: "Đồng bộ AMIS gần nhất", tone: "light" as const },
  ];

  return (
    <main className={`flex min-h-full flex-col items-center px-6 py-10 ${manrope.variable}`}>
      <div className="w-full max-w-3xl">
        <div className="relative overflow-hidden rounded-[28px] bg-brand-600 px-8 py-10 sm:px-12 sm:py-12">
          {/* Vòng tròn đồng tâm gợi cuộn tem/băng dính — chất liệu thật của ngành đóng gói,
              không phải hoạ tiết trang trí chung chung. */}
          <svg aria-hidden viewBox="0 0 340 340" className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80">
            <circle cx="230" cy="230" r="150" fill="none" stroke="#fff" strokeOpacity=".08" strokeWidth="26" />
            <circle cx="230" cy="230" r="105" fill="none" stroke="#EC1A39" strokeOpacity=".35" strokeWidth="16" />
            <circle cx="230" cy="230" r="66" fill="none" stroke="#fff" strokeOpacity=".14" strokeWidth="10" />
            <circle cx="230" cy="230" r="30" fill="#fff" fillOpacity=".06" />
          </svg>

          <span className="relative inline-flex w-fit items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">
            Công ty CP Giải pháp Đóng gói Hoàng Gia
          </span>
          <h1
            style={{ fontFamily: "var(--font-manrope), var(--font-inter), system-ui, sans-serif", textWrap: "balance" }}
            className="relative mt-4 max-w-xs text-3xl font-extrabold leading-tight text-white sm:max-w-sm sm:text-4xl"
          >
            Tìm mã hàng trong tích tắc
          </h1>
          <p className="relative mt-2 max-w-md text-sm text-white/70">
            Tra cứu tiêu chuẩn sản phẩm, QC, đóng gói và giấy tờ cho mọi mã hàng — kể cả các phiên bản cũ.
          </p>

          <form className="relative mt-7 flex max-w-lg items-center gap-2 rounded-full bg-white py-1.5 pl-2 pr-1.5 shadow-card">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-50 ring-1 ring-inset ring-gray-200">
              <span className="h-2 w-2 rounded-full bg-gray-300" />
            </span>
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Nhập mã hàng hoặc tên khách hàng..."
              autoFocus
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
            />
            <button type="submit" className="shrink-0 rounded-full bg-accent-500 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-600">
              Tìm
            </button>
          </form>
        </div>

        <div className="relative z-10 -mt-9 mb-6 flex justify-center gap-6 px-2">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col items-center">
              <div
                className={`flex h-[72px] w-[72px] items-center justify-center rounded-full text-center shadow-card ${
                  s.tone === "dark" ? "bg-accent-500 text-white" : "bg-white text-brand-700"
                }`}
              >
                <span style={{ fontFamily: "var(--font-manrope), var(--font-inter), system-ui, sans-serif" }} className="px-1 text-base font-extrabold leading-none">
                  {s.value}
                </span>
              </div>
              <span className="mt-2 max-w-[90px] text-center text-[11px] font-semibold text-gray-500">{s.label}</span>
            </div>
          ))}
        </div>

        {outcome && (
          <div>
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
