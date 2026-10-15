"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ManualSyncButtonProps {
  className?: string;
  variant?: "primary" | "secondary" | "outline";
  onSuccess?: () => void;
}

export function ManualSyncButton({ className = "", variant = "primary", onSuccess }: ManualSyncButtonProps) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleSync() {
    setSyncing(true);
    setResultMessage(null);
    setIsError(false);

    try {
      const res = await fetch("/api/admin/sync", { method: "POST" });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setIsError(true);
        setResultMessage(data?.error || "Đồng bộ thất bại — vui lòng thử lại sau.");
      } else {
        setIsError(false);
        const parts = [];
        if (data?.newProducts != null) parts.push(`+${data.newProducts} mã mới`);
        if (data?.newVersions != null) parts.push(`+${data.newVersions} phiên bản`);
        const summary = parts.length > 0 ? parts.join(", ") : "Dữ liệu đã mới nhất";
        setResultMessage(`Đồng bộ thành công! (${summary})`);
        router.refresh();
        if (onSuccess) onSuccess();
      }
    } catch {
      setIsError(true);
      setResultMessage("Lỗi kết nối khi đồng bộ AMIS.");
    } finally {
      setSyncing(false);
      // Tự động ẩn thông báo sau 6 giây
      setTimeout(() => {
        setResultMessage(null);
      }, 6000);
    }
  }

  const baseStyles =
    "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed";

  const variantStyles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    secondary: "bg-gray-100 text-gray-800 hover:bg-gray-200 border border-gray-200",
    outline: "border border-brand-600 text-brand-600 bg-white hover:bg-brand-50",
  }[variant];

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleSync}
        disabled={syncing}
        className={`${baseStyles} ${variantStyles} ${className}`}
        title="Đồng bộ dữ liệu sản phẩm thủ công từ AMIS"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
        >
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
        </svg>
        <span>{syncing ? "Đang đồng bộ..." : "Đồng bộ AMIS"}</span>
      </button>

      {resultMessage && (
        <div
          role="status"
          className={`absolute left-0 top-full z-50 mt-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium shadow-lg transition-all ${
            isError
              ? "border border-red-200 bg-red-50 text-red-700"
              : "border border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {resultMessage}
        </div>
      )}
    </div>
  );
}
