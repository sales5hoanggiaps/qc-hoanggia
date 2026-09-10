"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VersionBanner } from "./VersionBanner";
import type { ProductDetail } from "@/lib/products/get-product-detail";

interface SpecRow {
  groupName: string;
  criterion: string;
  value: string;
  tolerance: string;
  unit: string;
  note: string;
  sortOrder: number;
}

export function TCSPTab({
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
  const tcsp = version.tcsp;
  const [materialCode, setMaterialCode] = useState(tcsp?.materialCode ?? "");
  const [description, setDescription] = useState(tcsp?.description ?? "");
  const [preparedBy, setPreparedBy] = useState(tcsp?.preparedBy ?? "");
  const [approvedBy, setApprovedBy] = useState(tcsp?.approvedBy ?? "");
  const [approvedAt, setApprovedAt] = useState(tcsp?.approvedAt ? tcsp.approvedAt.toISOString().slice(0, 10) : "");
  const [rows, setRows] = useState<SpecRow[]>(
    (tcsp?.specRows ?? []).map((r) => ({
      groupName: r.groupName,
      criterion: r.criterion,
      value: r.value,
      tolerance: r.tolerance ?? "",
      unit: r.unit ?? "",
      note: r.note ?? "",
      sortOrder: r.sortOrder,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addRow() {
    setRows([...rows, { groupName: "Kích thước", criterion: "", value: "", tolerance: "", unit: "", note: "", sortOrder: rows.length }]);
  }
  function removeRow(index: number) {
    setRows(rows.filter((_, i) => i !== index));
  }
  function updateRow(index: number, field: keyof SpecRow, value: string) {
    setRows(rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/products/${product.baseCode}/tcsp`, {
      method: "PATCH",
      body: JSON.stringify({
        materialCode: materialCode || null,
        description: description || null,
        preparedBy: preparedBy || null,
        approvedBy: approvedBy || null,
        approvedAt: approvedAt || null,
        specRows: rows.map((r, i) => ({ ...r, sortOrder: i })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Lưu thất bại — thử lại.");
      return;
    }
    onDoneEditing();
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="space-y-3 text-sm">
        <VersionBanner version={{ baseCode: product.baseCode, versionNumber: version.versionNumber, amisProductId: version.amisProductId, isCurrent: version.isCurrent }} />
        <p><strong>Mã NL:</strong> {tcsp?.materialCode || "—"}</p>
        <p><strong>Mô tả:</strong> {tcsp?.description || "—"}</p>
        <p><strong>Người lập:</strong> {tcsp?.preparedBy || "—"} · <strong>Người duyệt:</strong> {tcsp?.approvedBy || "—"} · <strong>Ngày duyệt:</strong> {tcsp?.approvedAt ? new Date(tcsp.approvedAt).toLocaleDateString("vi-VN") : "—"}</p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Nhóm</th><th className="p-2">Tiêu chí</th><th className="p-2">Thông số</th>
              <th className="p-2">D/sai</th><th className="p-2">Đơn vị</th><th className="p-2">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {(tcsp?.specRows ?? []).map((r) => (
              <tr key={r.id} className="border-b">
                <td className="p-2">{r.groupName}</td><td className="p-2">{r.criterion}</td><td className="p-2">{r.value}</td>
                <td className="p-2">{r.tolerance}</td><td className="p-2">{r.unit}</td><td className="p-2">{r.note}</td>
              </tr>
            ))}
            {(tcsp?.specRows ?? []).length === 0 && (
              <tr><td colSpan={6} className="p-2 text-gray-400">Chưa có dữ liệu</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <VersionBanner version={{ baseCode: product.baseCode, versionNumber: version.versionNumber, amisProductId: version.amisProductId, isCurrent: version.isCurrent }} />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Mã NL<input className="mt-1 w-full rounded border px-2 py-1" value={materialCode} onChange={(e) => setMaterialCode(e.target.value)} /></label>
        <label className="text-sm">Người lập<input className="mt-1 w-full rounded border px-2 py-1" value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} /></label>
      </div>
      <label className="block text-sm">Mô tả<textarea className="mt-1 w-full rounded border px-2 py-1" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Người duyệt<input className="mt-1 w-full rounded border px-2 py-1" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} /></label>
        <label className="text-sm">Ngày duyệt<input type="date" className="mt-1 w-full rounded border px-2 py-1" value={approvedAt} onChange={(e) => setApprovedAt(e.target.value)} /></label>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Nhóm</th><th className="p-2">Tiêu chí</th><th className="p-2">Thông số</th>
            <th className="p-2">D/sai</th><th className="p-2">Đơn vị</th><th className="p-2">Ghi chú</th><th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b">
              <td className="p-1">
                <select className="rounded border px-1 py-0.5" value={row.groupName} onChange={(e) => updateRow(i, "groupName", e.target.value)}>
                  <option value="Kích thước">Kích thước</option>
                  <option value="TC khác">TC khác</option>
                </select>
              </td>
              <td className="p-1"><input className="w-full rounded border px-1 py-0.5" value={row.criterion} onChange={(e) => updateRow(i, "criterion", e.target.value)} /></td>
              <td className="p-1"><input className="w-full rounded border px-1 py-0.5" value={row.value} onChange={(e) => updateRow(i, "value", e.target.value)} /></td>
              <td className="p-1"><input className="w-full rounded border px-1 py-0.5" value={row.tolerance} onChange={(e) => updateRow(i, "tolerance", e.target.value)} /></td>
              <td className="p-1"><input className="w-full rounded border px-1 py-0.5" value={row.unit} onChange={(e) => updateRow(i, "unit", e.target.value)} /></td>
              <td className="p-1"><input className="w-full rounded border px-1 py-0.5" value={row.note} onChange={(e) => updateRow(i, "note", e.target.value)} /></td>
              <td className="p-1"><button onClick={() => removeRow(i)} className="text-red-600">Xoá</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addRow} className="text-sm text-brand-600 hover:underline">+ Thêm dòng</button>

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
