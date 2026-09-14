"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
        <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 8l-4 4 4 4M6 12h11" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Đăng xuất
    </button>
  );
}
