import Link from "next/link";
import type { ProductDetail } from "@/lib/products/get-product-detail";

const SOURCE_LABELS: Record<string, string> = { AMIS_SYNC: "Đồng bộ AMIS", MANUAL: "Chỉnh sửa thủ công" };

export function HistoryTab({ product }: { product: ProductDetail }) {
  return (
    <div className="space-y-4 text-sm">
      {product.versions.map((v) => (
        <div key={v.id} className="rounded border p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {product.baseCode}.{v.versionNumber} {v.isCurrent && <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">Hiện hành</span>}
            </span>
            {!v.isCurrent && (
              <Link href={`/products/${product.baseCode}/v/${v.versionNumber}`} className="text-brand-600 hover:underline">
                Xem phiên bản này
              </Link>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Tạo lúc {new Date(v.createdAt).toLocaleString("vi-VN")} — {v.createdByAmisSync ? "từ đồng bộ AMIS" : "thủ công"}
          </p>
          {v.changeLogs.length > 0 && (
            <ul className="mt-2 space-y-1 border-t pt-2">
              {v.changeLogs.map((log) => (
                <li key={log.id} className="text-xs text-gray-600">
                  <span className="font-medium">{log.fieldPath}</span>: {log.oldValue ?? "(trống)"} → {log.newValue ?? "(trống)"}
                  {" · "}
                  {SOURCE_LABELS[log.source] ?? log.source}
                  {" · "}
                  {new Date(log.changedAt).toLocaleString("vi-VN")}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
