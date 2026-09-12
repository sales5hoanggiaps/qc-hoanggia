"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VersionBanner } from "./VersionBanner";
import type { ProductDetail } from "@/lib/products/get-product-detail";

const KIND_LABELS: Record<string, string> = { COA: "COA", MSDS: "MSDS", ROHS: "Test ROHS", OTHER: "Khác" };
const KIND_OPTIONS = ["COA", "MSDS", "ROHS", "OTHER"] as const;

export function DocumentsTab({
  product,
  editing,
  onDoneEditing,
  mediaUrls = {},
}: {
  product: ProductDetail;
  editing: boolean;
  onDoneEditing: () => void;
  mediaUrls?: Record<string, string>;
}) {
  const router = useRouter();
  const version = product.currentVersion!;
  const files = version.documents?.files ?? [];
  const bannerVersion = { baseCode: product.baseCode, versionNumber: version.versionNumber, amisProductId: version.amisProductId, isCurrent: version.isCurrent };

  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState<(typeof KIND_OPTIONS)[number]>("COA");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!label.trim()) {
      setError("Nhập tên tài liệu trước khi chọn file.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const upRes = await fetch(`/api/products/${product.baseCode}/documents/upload-url`, {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, size: file.size }),
      });
      if (!upRes.ok) throw new Error((await upRes.json()).error ?? "Không xin được URL tải lên");
      const { uploadUrl, storageKey } = await upRes.json();

      const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) throw new Error("Tải file lên thất bại");

      const createRes = await fetch(`/api/products/${product.baseCode}/documents`, {
        method: "POST",
        body: JSON.stringify({ storageKey, kind, label: label.trim() }),
      });
      if (!createRes.ok) throw new Error("Lưu thông tin tài liệu thất bại");
      setLabel("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(docId: string) {
    if (!confirm("Xoá tài liệu này?")) return;
    const res = await fetch(`/api/products/${product.baseCode}/documents/${docId}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-3 text-sm">
      <VersionBanner version={bannerVersion} />
      {files.length === 0 ? (
        <p className="text-gray-400">Chưa có tài liệu nào</p>
      ) : (
        <ul className="divide-y rounded border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between p-2">
              <span>
                {KIND_LABELS[f.kind] ?? f.kind} — {f.label}
                {mediaUrls[f.id] && (
                  <a href={mediaUrls[f.id]} target="_blank" rel="noreferrer" className="ml-2 text-brand-600 hover:underline">
                    Tải xuống
                  </a>
                )}
              </span>
              {editing && <button onClick={() => handleDelete(f.id)} className="text-red-600">Xoá</button>}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        // Khác TCSP/QC/Đóng gói: mỗi upload/xóa ở đây là 1 hành động lưu ngay lập tức, không có
        // buffer/"Lưu"/"Huỷ" gộp — nên nút thoát chỉ đơn giản là "Xong", không cần reset state.
        <div className="space-y-2 rounded border p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              Loại tài liệu
              <select className="mt-1 w-full rounded border px-2 py-1" value={kind} onChange={(e) => setKind(e.target.value as (typeof KIND_OPTIONS)[number])}>
                {KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>{KIND_LABELS[k]}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Tên tài liệu
              <input className="mt-1 w-full rounded border px-2 py-1" value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
          </div>
          <label className="inline-block cursor-pointer rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700">
            {uploading ? "Đang tải lên..." : "+ Chọn file"}
            <input type="file" className="hidden" disabled={uploading} onChange={handleFileChange} />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <button onClick={onDoneEditing} className="rounded border px-4 py-1.5 text-sm hover:bg-gray-50">Xong</button>
          </div>
        </div>
      )}
    </div>
  );
}
