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

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}

function IconList() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" strokeLinejoin="round" />
    </svg>
  );
}

function IconSync() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M4 4v5h5M20 20v-5h-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 15a8 8 0 0014 3.5M19.5 9a8 8 0 00-14-3.5" strokeLinecap="round" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
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
  activeClass: string;
  hoverClass: string;
}

export function DashboardNav({ role, fullName }: { role: UserRole; fullName?: string }) {
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const pathname = usePathname();
  const canManageContent = role === UserRole.MANAGER || role === UserRole.ADMIN;

  const items: NavItem[] = [
    {
      href: "/",
      label: "Tìm kiếm",
      icon: IconSearch,
      visible: true,
      activeClass: "bg-red-600 text-white shadow-md shadow-red-500/25 ring-2 ring-red-500/30",
      hoverClass: "hover:border-red-300 hover:bg-red-50/70 hover:text-red-700",
    },
    {
      href: "/danh-sach",
      label: "Danh sách mã hàng",
      icon: IconList,
      visible: true,
      activeClass: "bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-500/30",
      hoverClass: "hover:border-blue-300 hover:bg-blue-50/70 hover:text-blue-700",
    },
    {
      href: "/admin/sync",
      label: "Đồng bộ AMIS",
      icon: IconSync,
      visible: true,
      activeClass: "bg-purple-600 text-white shadow-md shadow-purple-500/25 ring-2 ring-purple-500/30",
      hoverClass: "hover:border-purple-300 hover:bg-purple-50/70 hover:text-purple-700",
    },
    {
      href: "/admin/categories",
      label: "Quản trị viên",
      icon: IconShield,
      visible: canManageContent,
      activeClass: "bg-amber-600 text-white shadow-md shadow-amber-500/25 ring-2 ring-amber-500/30",
      hoverClass: "hover:border-amber-300 hover:bg-amber-50/70 hover:text-amber-700",
    },
    {
      href: "/admin/users",
      label: "Tài khoản",
      icon: IconUser,
      visible: role === UserRole.ADMIN,
      activeClass: "bg-emerald-600 text-white shadow-md shadow-emerald-500/25 ring-2 ring-emerald-500/30",
      hoverClass: "hover:border-emerald-300 hover:bg-emerald-50/70 hover:text-emerald-700",
    },
  ];

  return (
    <>
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        {/* Logo & Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/" className="group flex items-center gap-2.5 transition-opacity hover:opacity-90">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Hoàng Gia PS" className="h-8 w-auto" />
            <div className="border-l border-gray-200 pl-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-brand-700">Hoàng Gia PS</div>
              <div className="text-[10px] font-medium text-gray-400">Kiểm soát chất lượng</div>
            </div>
          </Link>
        </div>

        {/* Danh sách trang thành các ô nằm ngang với màu đẹp mắt */}
        <nav className="flex flex-wrap items-center gap-2 overflow-x-auto py-1">
          {items
            .filter((item) => item.visible)
            .map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-medium transition-all duration-150 shadow-sm ${
                    active
                      ? `${item.activeClass} font-semibold`
                      : `bg-slate-50 text-slate-700 border border-slate-200/90 ${item.hoverClass}`
                  }`}
                >
                  <Icon />
                  <span>{item.label}</span>
                </Link>
              );
            })}
        </nav>

        {/* User Info & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {fullName && (
            <div className="hidden sm:flex flex-col items-end px-2">
              <span className="max-w-[160px] truncate text-xs font-semibold text-gray-800">{fullName}</span>
              <span className="text-[10px] font-medium text-brand-600 bg-brand-50 rounded-full px-1.5 py-0.2 border border-brand-200/60">
                {ROLE_LABELS[role]}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowPasswordModal(true)}
            title="Đổi mật khẩu"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-3.5 w-3.5 text-gray-500">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            <span className="hidden md:inline">Đổi MK</span>
          </button>

          <SignOutButton
            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50/60 px-2.5 py-1.5 text-xs font-medium text-red-600 shadow-sm transition-colors hover:bg-red-100 hover:text-red-700"
          />
        </div>
      </div>

      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />
    </>
  );
}
