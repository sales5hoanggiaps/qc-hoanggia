"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VersionBanner } from "./VersionBanner";
import { MediaGallery } from "./MediaGallery";
import { MediaUploader } from "./MediaUploader";
import type { ProductDetail } from "@/lib/products/get-product-detail";

export function QCTab({
  product,
  editing,
  onDoneEditing = () => {},
  mediaUrls = {},
  version: versionOverride,
}: {
  product: ProductDetail;
  editing: boolean;
  onDoneEditing?: () => void;
  mediaUrls?: Record<string, string>;
  version?: NonNullable<ProductDetail["currentVersion"]>;
}) {
  const router = useRouter();
  const version = versionOverride ?? product.currentVersion!;
  const qc = version.qc;
  const [checklist, setChecklist] = useState(qc?.checklist ?? "");
  const [knownDefects, setKnownDefects] = useState(qc?.knownDefects ?? "");
  const [specialNotes, setSpecialNotes] = useState(qc?.specialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    // Xem giải thích trong TCSPTab: component không unmount khi Huỷ nên phải tự reset state cục
    // bộ về giá trị đã lưu (props), nếu không lần sửa bỏ dở còn nguyên khi vào lại chế độ sửa.
    setChecklist(qc?.checklist ?? "");
    setKnownDefects(qc?.knownDefects ?? "");
    setSpecialNotes(qc?.specialNotes ?? "");
    setError(null);
    onDoneEditing();
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/products/${product.baseCode}/qc`, {
      method: "PATCH",
      body: JSON.stringify({ checklist: checklist || null, knownDefects: knownDefects || null, specialNotes: specialNotes || null }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Lưu thất bại — thử lại.");
      return;
    }
    onDoneEditing();
    router.refresh();
  }

  const bannerVersion = { baseCode: product.baseCode, versionNumber: version.versionNumber, amisProductId: version.amisProductId, isCurrent: version.isCurrent };

  if (!editing) {
    return (
      <div className="space-y-3 text-sm">
        <VersionBanner version={bannerVersion} />
        <div><strong>Các mục cần QC:</strong><p className="whitespace-pre-wrap">{qc?.checklist || "Chưa có dữ liệu"}</p></div>
        <div><strong>Lỗi đã từng gặp:</strong><p className="whitespace-pre-wrap">{qc?.knownDefects || "Chưa có dữ liệu"}</p></div>
        <div><strong>Lưu ý đặc biệt:</strong><p className="whitespace-pre-wrap">{qc?.specialNotes || "Chưa có dữ liệu"}</p></div>
        <MediaGallery media={qc?.media ?? []} mediaUrls={mediaUrls} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <VersionBanner version={bannerVersion} />
      <label className="block text-sm">Các mục cần QC<textarea rows={4} className="mt-1 w-full rounded border px-2 py-1" value={checklist} onChange={(e) => setChecklist(e.target.value)} /></label>
      <label className="block text-sm">Lỗi đã từng gặp<textarea rows={4} className="mt-1 w-full rounded border px-2 py-1" value={knownDefects} onChange={(e) => setKnownDefects(e.target.value)} /></label>
      <label className="block text-sm">Lưu ý đặc biệt<textarea rows={4} className="mt-1 w-full rounded border px-2 py-1" value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} /></label>

      <MediaUploader baseCode={product.baseCode} tab="qc" media={qc?.media ?? []} mediaUrls={mediaUrls} onChanged={() => router.refresh()} />

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="rounded bg-brand-600 px-4 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Đang lưu..." : "Lưu"}
        </button>
        <button onClick={handleCancel} className="rounded border px-4 py-1.5 text-sm hover:bg-gray-50">Huỷ</button>
      </div>
    </div>
  );
}
