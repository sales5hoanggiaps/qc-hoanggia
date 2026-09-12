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
    <div className="p-6">
      <h1 className="text-lg font-semibold">
        {product.baseCode}.{version.versionNumber} — {version.name}
      </h1>
      <p className="mb-4 text-sm text-gray-500">Xem lại phiên bản cũ — không sửa được.</p>
      <a
        href={`/api/products/${product.baseCode}/tcsp/export?version=${version.versionNumber}`}
        className="mb-4 inline-block rounded border border-brand-600 px-3 py-1 text-sm text-brand-600 hover:bg-brand-50"
      >
        Tải TCSP (.xlsx)
      </a>

      <div className="mt-4 space-y-6 text-sm">
        <section>
          <h2 className="mb-2 font-medium">Tiêu chuẩn sản phẩm</h2>
          <TCSPTab product={product} version={version} editing={false} mediaUrls={mediaUrls} />
        </section>
        <section>
          <h2 className="mb-2 font-medium">QC sản phẩm</h2>
          <QCTab product={product} version={version} editing={false} mediaUrls={mediaUrls} />
        </section>
        <section>
          <h2 className="mb-2 font-medium">Quy cách đóng gói</h2>
          <PackagingTab product={product} version={version} editing={false} mediaUrls={mediaUrls} />
        </section>
        <section>
          <h2 className="mb-2 font-medium">Giấy tờ sản phẩm</h2>
          <DocumentsTab product={product} version={version} editing={false} mediaUrls={mediaUrls} />
        </section>
      </div>
    </div>
  );
}
