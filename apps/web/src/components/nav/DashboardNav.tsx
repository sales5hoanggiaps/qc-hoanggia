"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserRole } from "@qc/db";
import { SignOutButton } from "./SignOutButton";
import { ChangePasswordModal } from "./ChangePasswordModal";

const ROLE_LABELS: Record<UserRole, string> = {
  QC_STAFF: "Nhân viên QC",
  SALES_STAFF: "Nhân viên Kinh doanh",
  MANAGER: "Quản trị viên",
  ADMIN: "Quản trị hệ thống",
};

// Icon line-style tối giản (không cần thêm thư viện icon ngoài) — cùng 1 viewBox 24x24, stroke
// hiện tại kế thừa màu chữ (currentColor) để tự đổi màu theo trạng thái active/hover.
function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}
function IconList() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
      <path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" strokeLinejoin="round" />
    </svg>
  );
}
function IconSync() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
      <path d="M4 4v5h5M20 20v-5h-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 15a8 8 0 0014 3.5M19.5 9a8 8 0 00-14-3.5" strokeLinecap="round" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" strokeLinecap="round" />
    </svg>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: () => React.JSX.Element;
  visible: boolean;
}

export function DashboardNav({ role, fullName }: { role: UserRole; fullName?: string }) {
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const pathname = usePathname();
  const canManageContent = role === UserRole.MANAGER || role === UserRole.ADMIN;

  const items: NavItem[] = [
    { href: "/", label: "Tìm kiếm", icon: IconSearch, visible: true },
    { href: "/danh-sach", label: "Danh sách mã hàng", icon: IconList, visible: true },
    { href: "/admin/categories", label: "Quản trị viên", icon: IconShield, visible: canManageContent },
    { href: "/admin/sync", label: "Đồng bộ AMIS", icon: IconSync, visible: canManageContent },
    { href: "/admin/users", label: "Tài khoản", icon: IconUser, visible: role === UserRole.ADMIN },
  ];

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="border-b px-5 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo.svg là ảnh tĩnh trong public/,
              không cần next/image tối ưu hoá (không phải ảnh do người dùng tải lên, không đổi kích thước). */}
          <img src="/logo.svg" alt="Hoàng Gia PS" className="h-9 w-auto" />
          <div className="mt-1.5 text-xs text-gray-400">Bộ phận Kiểm soát chất lượng</div>
        </div>

        <nav className="flex-1 space-y-0.5 p-3 text-sm">
          {items
            .filter((item) => item.visible)
            .map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                    active ? "bg-brand-50 font-medium text-brand-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  <span className={active ? "text-brand-600" : "text-gray-400"}>
                    <Icon />
                  </span>
                  {item.label}
                </Link>
              );
            })}
        </nav>

        <div className="border-t p-3">
          {fullName && (
            <div className="px-3 py-1.5">
              <p className="truncate text-sm font-medium text-gray-800">{fullName}</p>
              <p className="text-xs text-gray-400">{ROLE_LABELS[role]}</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowPasswordModal(true)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5 text-gray-400">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            Đổi mật khẩu
          </button>
          <SignOutButton />
        </div>
      </div>

      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />
    </>
  );
}
