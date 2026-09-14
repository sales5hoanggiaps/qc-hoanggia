import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

// next/font tự tải + tối ưu font lúc build (self-host, không gọi CDN Google Fonts lúc runtime) —
// hỗ trợ đầy đủ dấu tiếng Việt qua subset "latin" + "vietnamese".
const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "QC Hoàng Gia",
  description: "Hệ thống tra cứu tiêu chuẩn sản phẩm & QC — Hoàng Gia",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={inter.variable}>
      <body className="min-h-screen bg-gray-50 font-sans text-gray-900 antialiased">{children}</body>
    </html>
  );
}
