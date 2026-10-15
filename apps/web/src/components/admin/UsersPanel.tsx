"use client";

import { useEffect, useState } from "react";
import { ResetPasswordModal } from "./ResetPasswordModal";

interface UserRow {
  id: string;
  fullName: string;
  username: string;
  role: "QC_STAFF" | "SALES_STAFF" | "MANAGER" | "ADMIN";
  isActive: boolean;
}

const ROLE_LABELS: Record<UserRow["role"], string> = {
  QC_STAFF: "Nhân viên QC",
  SALES_STAFF: "Nhân viên Kinh doanh",
  MANAGER: "Quản trị viên",
  ADMIN: "Quản trị hệ thống",
};

export function UsersPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [role, setRole] = useState<"QC_STAFF" | "SALES_STAFF" | "MANAGER">("QC_STAFF");
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);

  async function load() {
    const res = await fetch("/api/admin/users");
    const body = await res.json();
    setUsers(body.users ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, username, tempPassword, role }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Không tạo được tài khoản — kiểm tra lại thông tin.");
        return;
      }
      setFullName("");
      setUsername("");
      setTempPassword("");
      await load();
    } catch {
      setError("Không thể kết nối đến máy chủ.");
    }
  }

  async function toggleActive(user: UserRow) {
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    await load();
  }

  async function changeRole(user: UserRow, newRole: "QC_STAFF" | "SALES_STAFF" | "MANAGER") {
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role: newRole }),
    });
    await load();
  }

  return (
    <div className="space-y-6 p-8">
      <h1 className="text-2xl font-semibold text-gray-900">Quản lý tài khoản</h1>

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-card">
        <div>
          <label className="block text-xs font-medium text-gray-700">Họ tên</label>
          <input className="mt-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:ring-brand-500" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Tên đăng nhập</label>
          <input className="mt-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:ring-brand-500" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Mật khẩu tạm</label>
          <input
            type="password"
            className="mt-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:ring-brand-500"
            value={tempPassword}
            onChange={(e) => setTempPassword(e.target.value)}
            placeholder="Tối thiểu 6 ký tự"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Vai trò</label>
          <select className="mt-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:ring-brand-500" value={role} onChange={(e) => setRole(e.target.value as "QC_STAFF" | "SALES_STAFF" | "MANAGER")}>
            <option value="QC_STAFF">Nhân viên QC</option>
            <option value="SALES_STAFF">Nhân viên Kinh doanh</option>
            <option value="MANAGER">Quản trị viên</option>
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
          Tạo tài khoản
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2.5">Họ tên</th>
              <th className="px-3 py-2.5">Tên đăng nhập</th>
              <th className="px-3 py-2.5">Vai trò</th>
              <th className="px-3 py-2.5">Trạng thái</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2.5 text-gray-700">{u.fullName}</td>
                <td className="px-3 py-2.5 text-gray-700">{u.username}</td>
                <td className="px-3 py-2.5 text-gray-700">
                  {u.role === "ADMIN" ? (
                    <span className="font-semibold text-purple-700">{ROLE_LABELS[u.role]}</span>
                  ) : (
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u, e.target.value as "QC_STAFF" | "SALES_STAFF" | "MANAGER")}
                      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="QC_STAFF">Nhân viên QC</option>
                      <option value="SALES_STAFF">Nhân viên Kinh doanh</option>
                      <option value="MANAGER">Quản trị viên</option>
                    </select>
                  )}
                </td>
                <td className="px-3 py-2.5 text-gray-700">{u.isActive ? "Đang hoạt động" : "Đã khoá"}</td>
                <td className="space-x-3 px-3 py-2.5">
                  <button
                    onClick={() => setSelectedUser(u)}
                    className="font-medium text-amber-600 hover:underline"
                  >
                    Đổi mật khẩu
                  </button>
                  {/* Tài khoản ADMIN không thể tự khoá lẫn nhau qua giao diện này — tránh trường hợp
                      1 ADMIN khoá hết các ADMIN còn lại (kể cả chính mình) và không ai còn mở khoá được. */}
                  {u.role !== "ADMIN" && (
                    <button onClick={() => toggleActive(u)} className="font-medium text-brand-600 hover:underline">
                      {u.isActive ? "Khoá" : "Mở khoá"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ResetPasswordModal
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onSuccess={load}
      />
    </div>
  );
}
