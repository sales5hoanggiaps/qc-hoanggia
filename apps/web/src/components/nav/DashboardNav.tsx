import Link from "next/link";
import { UserRole } from "@qc/db";
import { SignOutButton } from "./SignOutButton";

export function DashboardNav({ role }: { role: UserRole }) {
  const canManageContent = role === UserRole.MANAGER || role === UserRole.ADMIN;

  return (
    <nav className="flex flex-col gap-1 p-4 text-sm">
      <Link href="/" className="rounded px-3 py-2 hover:bg-gray-100">
        Tìm kiếm
      </Link>
      <Link href="/danh-sach" className="rounded px-3 py-2 hover:bg-gray-100">
        Danh sách mã hàng
      </Link>
      {canManageContent && (
        <Link href="/admin/categories" className="rounded px-3 py-2 hover:bg-gray-100">
          Quản trị viên
        </Link>
      )}
      {canManageContent && (
        <Link href="/admin/sync" className="rounded px-3 py-2 hover:bg-gray-100">
          Đồng bộ AMIS
        </Link>
      )}
      {role === UserRole.ADMIN && (
        <Link href="/admin/users" className="rounded px-3 py-2 hover:bg-gray-100">
          Tài khoản
        </Link>
      )}
      <SignOutButton />
    </nav>
  );
}
