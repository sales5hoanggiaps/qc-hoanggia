import { VersionBanner } from "./VersionBanner";
import type { ProductDetail } from "@/lib/products/get-product-detail";

const KIND_LABELS: Record<string, string> = { COA: "COA", MSDS: "MSDS", ROHS: "Test ROHS", OTHER: "Khác" };

export function DocumentsTab({ product }: { product: ProductDetail }) {
  const version = product.currentVersion!;
  const files = version.documents?.files ?? [];
  const bannerVersion = { baseCode: product.baseCode, versionNumber: version.versionNumber, amisProductId: version.amisProductId, isCurrent: version.isCurrent };

  return (
    <div className="space-y-3 text-sm">
      <VersionBanner version={bannerVersion} />
      {files.length === 0 ? (
        <p className="text-gray-400">Chưa có tài liệu nào — chức năng tải lên sẽ có ở phiên bản sau.</p>
      ) : (
        <ul className="divide-y rounded border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between p-2">
              <span>{KIND_LABELS[f.kind] ?? f.kind} — {f.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
