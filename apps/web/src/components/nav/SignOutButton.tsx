"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded px-3 py-2 text-left hover:bg-gray-100"
    >
      Đăng xuất
    </button>
  );
}
