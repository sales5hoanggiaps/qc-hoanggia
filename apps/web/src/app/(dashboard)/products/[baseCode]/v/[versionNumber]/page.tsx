import { notFound } from "next/navigation";
import { getProductDetail } from "@/lib/products/get-product-detail";
import { VersionBanner } from "@/components/products/VersionBanner";

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

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">
        {product.baseCode}.{version.versionNumber} — {version.name}
      </h1>
      <p className="mb-4 text-sm text-gray-500">Xem lại phiên bản cũ — không sửa được.</p>
      <VersionBanner
        version={{ baseCode: product.baseCode, versionNumber: version.versionNumber, amisProductId: version.amisProductId, isCurrent: version.isCurrent }}
      />
      <div className="mt-4 space-y-4 text-sm">
        <section>
          <h2 className="font-medium">Tiêu chuẩn sản phẩm</h2>
          <p>{version.tcsp?.description || "Chưa có dữ liệu"}</p>
        </section>
        <section>
          <h2 className="font-medium">QC sản phẩm</h2>
          <p className="whitespace-pre-wrap">{version.qc?.checklist || "Chưa có dữ liệu"}</p>
        </section>
        <section>
          <h2 className="font-medium">Quy cách đóng gói</h2>
          <p className="whitespace-pre-wrap">{version.packaging?.instructions || "Chưa có dữ liệu"}</p>
        </section>
      </div>
    </div>
  );
}
