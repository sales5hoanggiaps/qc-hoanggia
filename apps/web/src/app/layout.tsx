import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

// next/font tự tải + tối ưu font lúc build (self-host, không gọi CDN Google Fonts lúc runtime) —
// hỗ trợ đầy đủ dấu tiếng Việt qua subset "latin", "vietnamese" và "latin-ext".
const inter = Inter({ subsets: ["latin", "vietnamese", "latin-ext"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "QC Hoàng Gia",
  description: "Hệ thống tra cứu tiêu chuẩn sản phẩm & QC — Hoàng Gia",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "QC Hoàng Gia",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={inter.variable}>
      <body className="min-h-screen bg-gray-50 font-sans text-gray-900 antialiased">{children}</body>
    </html>
  );
}
