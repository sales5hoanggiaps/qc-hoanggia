"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VersionBanner } from "./VersionBanner";
import type { ProductDetail } from "@/lib/products/get-product-detail";

export function PackagingTab({
  product,
  editing,
  onDoneEditing,
}: {
  product: ProductDetail;
  editing: boolean;
  onDoneEditing: () => void;
}) {
  const router = useRouter();
  const version = product.currentVersion!;
  const packaging = version.packaging;
  const [instructions, setInstructions] = useState(packaging?.instructions ?? "");
  const [specialNotes, setSpecialNotes] = useState(packaging?.specialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/products/${product.baseCode}/packaging`, {
      method: "PATCH",
      body: JSON.stringify({ instructions: instructions || null, specialNotes: specialNotes || null }),
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
        <div><strong>Hướng dẫn đóng gói:</strong><p className="whitespace-pre-wrap">{packaging?.instructions || "Chưa có dữ liệu"}</p></div>
        <div><strong>Lưu ý đóng gói:</strong><p className="whitespace-pre-wrap">{packaging?.specialNotes || "Chưa có dữ liệu"}</p></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <VersionBanner version={bannerVersion} />
      <label className="block text-sm">Hướng dẫn đóng gói<textarea rows={5} className="mt-1 w-full rounded border px-2 py-1" value={instructions} onChange={(e) => setInstructions(e.target.value)} /></label>
      <label className="block text-sm">Lưu ý đóng gói, tem nhãn dán thùng<textarea rows={5} className="mt-1 w-full rounded border px-2 py-1" value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} /></label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="rounded bg-brand-600 px-4 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Đang lưu..." : "Lưu"}
        </button>
        <button onClick={onDoneEditing} className="rounded border px-4 py-1.5 text-sm hover:bg-gray-50">Huỷ</button>
      </div>
    </div>
  );
}
