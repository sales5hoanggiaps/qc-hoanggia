"use client";

import { useEffect, useState } from "react";

interface UserRow {
  id: string;
  fullName: string;
  username: string;
  role: "QC_STAFF" | "MANAGER" | "ADMIN";
  isActive: boolean;
}

const ROLE_LABELS: Record<UserRow["role"], string> = {
  QC_STAFF: "Nhân viên QC",
  MANAGER: "Quản trị viên",
  ADMIN: "Quản trị hệ thống",
};

export function UsersPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [role, setRole] = useState<"QC_STAFF" | "MANAGER">("QC_STAFF");
  const [error, setError] = useState<string | null>(null);

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
    const res = await fetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ fullName, username, tempPassword, role }),
    });
    if (!res.ok) {
      setError("Không tạo được tài khoản — kiểm tra lại thông tin.");
      return;
    }
    setFullName("");
    setUsername("");
    setTempPassword("");
    await load();
  }

  async function toggleActive(user: UserRow) {
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    await load();
  }

  async function toggleManager(user: UserRow) {
    const nextRole = user.role === "MANAGER" ? "QC_STAFF" : "MANAGER";
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role: nextRole }),
    });
    await load();
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-lg font-semibold">Quản lý tài khoản</h1>

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2 rounded border bg-white p-4">
        <div>
          <label className="block text-xs font-medium">Họ tên</label>
          <input className="rounded border px-2 py-1" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium">Tên đăng nhập</label>
          <input className="rounded border px-2 py-1" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium">Mật khẩu tạm</label>
          <input className="rounded border px-2 py-1" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium">Vai trò</label>
          <select className="rounded border px-2 py-1" value={role} onChange={(e) => setRole(e.target.value as "QC_STAFF" | "MANAGER")}>
            <option value="QC_STAFF">QC Staff</option>
            <option value="MANAGER">Quản trị viên</option>
          </select>
        </div>
        <button type="submit" className="rounded bg-brand-600 px-4 py-1.5 text-white hover:bg-brand-700">
          Tạo tài khoản
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Họ tên</th>
            <th className="p-2">Tên đăng nhập</th>
            <th className="p-2">Vai trò</th>
            <th className="p-2">Trạng thái</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b">
              <td className="p-2">{u.fullName}</td>
              <td className="p-2">{u.username}</td>
              <td className="p-2">{ROLE_LABELS[u.role]}</td>
              <td className="p-2">{u.isActive ? "Đang hoạt động" : "Đã khoá"}</td>
              <td className="space-x-2 p-2">
                {u.role !== "ADMIN" && (
                  <button onClick={() => toggleManager(u)} className="text-brand-600 hover:underline">
                    {u.role === "MANAGER" ? "Bỏ Quản trị viên" : "Cấp Quản trị viên"}
                  </button>
                )}
                {/* Tài khoản ADMIN không thể tự khoá lẫn nhau qua giao diện này — tránh trường hợp
                    1 ADMIN khoá hết các ADMIN còn lại (kể cả chính mình) và không ai còn mở khoá được. */}
                {u.role !== "ADMIN" && (
                  <button onClick={() => toggleActive(u)} className="text-brand-600 hover:underline">
                    {u.isActive ? "Khoá" : "Mở khoá"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
