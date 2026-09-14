"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserRole } from "@qc/db";
import type { ProductDetail } from "@/lib/products/get-product-detail";
import { extractErrorMessage } from "@/lib/extract-error-message";

const SOURCE_LABELS: Record<string, string> = { AMIS_SYNC: "Đồng bộ AMIS", MANUAL: "Chỉnh sửa thủ công" };

export function HistoryTab({ product, role }: { product: ProductDetail; role: UserRole }) {
  const router = useRouter();
  const canConfirm = role === UserRole.MANAGER || role === UserRole.ADMIN;
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm(versionNumber: number) {
    setConfirmingId(String(versionNumber));
    setError(null);
    const res = await fetch(`/api/products/${product.baseCode}/versions/${versionNumber}/confirm-inheritance`, { method: "PATCH" });
    setConfirmingId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(extractErrorMessage(body, "Xác nhận thất bại — thử lại."));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4 text-sm">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {product.versions.map((v) => (
        <div key={v.id} className="rounded border p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {product.baseCode}.{v.versionNumber} {v.isCurrent && <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">Hiện hành</span>}
              {v.needsInheritanceReview && (
                <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">⚠ Cần xác nhận kế thừa</span>
              )}
            </span>
            <div className="flex items-center gap-3">
              {v.needsInheritanceReview && canConfirm && (
                <button
                  onClick={() => handleConfirm(v.versionNumber)}
                  disabled={confirmingId === String(v.versionNumber)}
                  className="rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {confirmingId === String(v.versionNumber) ? "Đang xác nhận..." : "Xác nhận đã kiểm tra"}
                </button>
              )}
              {!v.isCurrent && (
                <Link href={`/products/${product.baseCode}/v/${v.versionNumber}`} className="text-brand-600 hover:underline">
                  Xem phiên bản này
                </Link>
              )}
            </div>
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
