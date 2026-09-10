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
    <div className="space-y-6 p-6">
      <h1 className="text-lg font-semibold">Đồng bộ AMIS</h1>
      <button
        onClick={handleSync}
        disabled={syncing}
        className="rounded bg-brand-600 px-4 py-1.5 text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {syncing ? "Đang đồng bộ..." : "Đồng bộ ngay"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Bắt đầu</th>
            <th className="p-2">Mã mới</th>
            <th className="p-2">Phiên bản mới</th>
            <th className="p-2">Liên kết KH</th>
            <th className="p-2">Lỗi</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b">
              <td className="p-2">{new Date(log.startedAt).toLocaleString("vi-VN")}</td>
              <td className="p-2">{log.newProducts}</td>
              <td className="p-2">{log.newVersions}</td>
              <td className="p-2">{log.updatedLinks}</td>
              <td className="p-2 text-red-600">{log.errorMessage || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SyncLogRow {
  id: string;
  startedAt: string;
  newProducts: number;
  newVersions: number;
  updatedLinks: number;
  errorMessage: string | null;
}
