import { notFound } from "next/navigation";
import { getProductDetail } from "@/lib/products/get-product-detail";
import { buildMediaUrlMap } from "@/lib/products/build-media-url-map";
import { TCSPTab } from "@/components/products/TCSPTab";
import { QCTab } from "@/components/products/QCTab";
import { PackagingTab } from "@/components/products/PackagingTab";
import { DocumentsTab } from "@/components/products/DocumentsTab";

export default async function ProductOldVersionPage({
  params,
}: {
  params: { baseCode: string; versionNumber: string };
}) {
  const product = await getProductDetail(params.baseCode);
  if (!product) notFound();

  const versionNumber = Number(params.versionNumber);
  const version = product.versions.find((v) => v.versionNumber === versionNumber);
  if (!version) notFound();

  const mediaUrls = await buildMediaUrlMap(version);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center gap-3">
        <div>
          <p className="text-sm font-medium text-brand-600">{product.baseCode}.{version.versionNumber}</p>
          <h1 className="mt-0.5 text-2xl font-semibold text-gray-900">{version.name}</h1>
        </div>
        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
          Phiên bản cũ — chỉ đọc
        </span>
      </div>
      {/* Nút "Tải TCSP" của tab Tiêu chuẩn sản phẩm bên dưới đã tự trỏ đúng phiên bản này
          (TCSPTab dùng version.versionNumber) — không lặp lại 1 nút ở đây nữa. */}

      <div className="space-y-6">
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Tiêu chuẩn sản phẩm</h2>
          <TCSPTab product={product} version={version} editing={false} mediaUrls={mediaUrls} />
        </section>
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">QC sản phẩm</h2>
          <QCTab product={product} version={version} editing={false} mediaUrls={mediaUrls} />
        </section>
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Quy cách đóng gói</h2>
          <PackagingTab product={product} version={version} editing={false} mediaUrls={mediaUrls} />
        </section>
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Giấy tờ sản phẩm</h2>
          <DocumentsTab product={product} version={version} editing={false} mediaUrls={mediaUrls} />
        </section>
      </div>
    </div>
  );
}
