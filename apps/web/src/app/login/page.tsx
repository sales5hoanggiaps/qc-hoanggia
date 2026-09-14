"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconEyeOff() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
      <path d="M3 3l18 18" strokeLinecap="round" />
      <path d="M10.6 5.1A10.6 10.6 0 0112 5c6.5 0 10 7 10 7a17.4 17.4 0 01-3.4 4.3M6.6 6.6C4 8.3 2 12 2 12s3.5 7 10 7c1.4 0 2.6-.3 3.7-.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.9 9.9a3 3 0 004.2 4.2" strokeLinecap="round" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await signIn("credentials", { username, password, redirect: false });
    setSubmitting(false);
    if (result?.error) {
      setError("Sai tên đăng nhập hoặc mật khẩu.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-brand-900">
      {/* Panel thương hiệu — chỉ hiện ở màn hình rộng, cùng bố cục 2 cột với app "Quản lý phòng
          kinh doanh" (chung 1 công ty Hoàng Gia PS). */}
      <div className="relative hidden overflow-hidden lg:flex lg:w-1/2">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700" />
        <div className="relative z-10 flex flex-col justify-end p-12 text-white">
          <span className="mb-4 inline-flex w-fit items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">
            Công ty CP Giải pháp Đóng gói Hoàng Gia
          </span>
          <h2 className="text-2xl font-semibold leading-snug">
            Kiểm soát chất lượng
            <br />
            cho từng mã hàng
          </h2>
          <p className="mt-3 max-w-md text-sm text-white/70">
            Tra cứu, chỉnh sửa và đối soát tiêu chuẩn sản phẩm, QC, đóng gói và giấy tờ theo tiêu chuẩn ISO.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="overflow-hidden rounded-xl border-t-4 border-accent-600 bg-white shadow-card">
            <div className="flex flex-col items-center gap-3 border-b border-gray-100 px-8 pb-6 pt-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-50 p-2 shadow-card">
                {/* eslint-disable-next-line @next/next/no-img-element -- logo.svg tĩnh trong public/ */}
                <img src="/logo.svg" alt="Hoàng Gia PS" className="h-full w-full object-contain" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">QC HOÀNG GIA</h1>
                <p className="mt-0.5 text-sm text-gray-500">Bộ phận Kiểm soát chất lượng</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-8 py-6">
              {error && <p className="rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-700">{error}</p>}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Tên đăng nhập</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-brand-500"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Mật khẩu</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-brand-500 focus:ring-brand-500"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    tabIndex={-1}
                  >
                    {showPassword ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
              </button>
            </form>
          </div>
          <p className="mt-6 text-center text-xs text-white/50 lg:hidden">Công ty CP Giải pháp Đóng gói Hoàng Gia</p>
        </div>
      </div>
    </div>
  );
}
