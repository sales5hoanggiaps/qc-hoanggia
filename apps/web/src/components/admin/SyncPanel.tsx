"use client";

import { useState } from "react";

export function SyncPanel({ initialLogs }: { initialLogs: SyncLogRow[] }) {
  const [logs, setLogs] = useState(initialLogs);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    const res = await fetch("/api/admin/sync", { method: "POST" });
    setSyncing(false);
    if (!res.ok) {
      setError("Đồng bộ thất bại — xem log bên dưới sau khi tải lại trang.");
      return;
    }
    window.location.reload();
  }

  return (
    <div className="space-y-6 p-8">
      <h1 className="text-2xl font-semibold text-gray-900">Đồng bộ AMIS</h1>
      <button
        onClick={handleSync}
        disabled={syncing}
        className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {syncing ? "Đang đồng bộ..." : "Đồng bộ ngay"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2.5">Bắt đầu</th>
              <th className="px-3 py-2.5">Mã mới</th>
              <th className="px-3 py-2.5">Phiên bản mới</th>
              <th className="px-3 py-2.5">Liên kết KH</th>
              <th className="px-3 py-2.5">Cần xem xét</th>
              <th className="px-3 py-2.5">Trùng version</th>
              <th className="px-3 py-2.5">Lỗi</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2.5 text-gray-700">{new Date(log.startedAt).toLocaleString("vi-VN")}</td>
                <td className="px-3 py-2.5 text-gray-700">{log.newProducts}</td>
                <td className="px-3 py-2.5 text-gray-700">{log.newVersions}</td>
                <td className="px-3 py-2.5 text-gray-700">{log.updatedLinks}</td>
                <td className="px-3 py-2.5 text-gray-700">{log.flaggedReview}</td>
                <td className="px-3 py-2.5 text-gray-700">{log.duplicateVersionCodes}</td>
                <td className="px-3 py-2.5 text-red-600">{log.errorMessage || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface SyncLogRow {
  id: string;
  startedAt: string;
  newProducts: number;
  newVersions: number;
  updatedLinks: number;
  flaggedReview: number;
  duplicateVersionCodes: number;
  errorMessage: string | null;
}
