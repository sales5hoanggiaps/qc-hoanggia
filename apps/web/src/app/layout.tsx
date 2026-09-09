import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "QC Hoàng Gia",
  description: "Hệ thống tra cứu tiêu chuẩn sản phẩm & QC — Hoàng Gia",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
