"use client";

import { useState } from "react";

interface MediaItem {
  id: string;
  storageKey: string;
  mimeType: string;
  caption: string | null;
  sortOrder: number;
}

export function MediaUploader({
  baseCode,
  tab,
  media,
  mediaUrls,
  onChanged,
}: {
  baseCode: string;
  tab: "tcsp" | "qc" | "packaging";
  media: MediaItem[];
  mediaUrls: Record<string, string>;
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // cho phép chọn lại đúng file đó lần sau
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const upRes = await fetch(`/api/products/${baseCode}/media/upload-url`, {
        method: "POST",
        body: JSON.stringify({ tab, fileName: file.name, mimeType: file.type, size: file.size }),
      });
      if (!upRes.ok) throw new Error((await upRes.json()).error ?? "Không xin được URL tải lên");
      const { uploadUrl, storageKey } = await upRes.json();

      // KHÔNG tự đặt header Content-Length — trình duyệt tự tính từ File/Blob, và giá trị đó phải
      // khớp size đã khai ở bước trên (chữ ký presigned URL đã ký cứng theo size đó).
      const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) throw new Error("Tải file lên thất bại");

      const createRes = await fetch(`/api/products/${baseCode}/media`, {
        method: "POST",
        body: JSON.stringify({ tab, storageKey, mimeType: file.type, caption: null, sortOrder: media.length }),
      });
      if (!createRes.ok) throw new Error("Lưu thông tin file thất bại");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(assetId: string) {
    if (!confirm("Xoá file này?")) return;
    const res = await fetch(`/api/products/${baseCode}/media/${assetId}`, { method: "DELETE" });
    if (res.ok) onChanged();
  }

  async function handleMove(assetId: string, direction: -1 | 1) {
    const idx = media.findIndex((m) => m.id === assetId);
    const swapWith = idx + direction;
    if (idx < 0 || swapWith < 0 || swapWith >= media.length) return;
    await Promise.all([
      fetch(`/api/products/${baseCode}/media/${media[idx].id}`, { method: "PATCH", body: JSON.stringify({ sortOrder: swapWith }) }),
      fetch(`/api/products/${baseCode}/media/${media[swapWith].id}`, { method: "PATCH", body: JSON.stringify({ sortOrder: idx }) }),
    ]);
    onChanged();
  }

  async function handleCaptionChange(assetId: string, caption: string) {
    await fetch(`/api/products/${baseCode}/media/${assetId}`, { method: "PATCH", body: JSON.stringify({ caption: caption || null }) });
  }

  return (
    <div className="space-y-2">
      <label className="inline-block cursor-pointer rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700">
        {uploading ? "Đang tải lên..." : "+ Chọn file"}
        <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" className="hidden" disabled={uploading} onChange={handleFileChange} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-4 gap-2">
        {media.map((m, i) => (
          <div key={m.id} className="rounded border p-2 text-xs">
            {m.mimeType.startsWith("video/") ? (
              <video src={mediaUrls[m.id]} controls className="h-20 w-full rounded object-cover" />
            ) : (
              <img src={mediaUrls[m.id]} alt={m.caption ?? ""} className="h-20 w-full rounded object-cover" />
            )}
            <input
              className="mt-1 w-full rounded border px-1 py-0.5 text-xs"
              placeholder="Chú thích"
              defaultValue={m.caption ?? ""}
              onBlur={(e) => handleCaptionChange(m.id, e.target.value)}
            />
            <div className="mt-1 flex justify-between text-gray-500">
              <span>
                <button onClick={() => handleMove(m.id, -1)} disabled={i === 0} aria-label="Lên">↑</button>{" "}
                <button onClick={() => handleMove(m.id, 1)} disabled={i === media.length - 1} aria-label="Xuống">↓</button>
              </span>
              <button onClick={() => handleDelete(m.id)} className="text-red-600">Xoá</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
