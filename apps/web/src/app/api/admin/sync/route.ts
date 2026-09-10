import { NextResponse } from "next/server";
import { UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";

const MANAGER_OR_ADMIN = [UserRole.MANAGER, UserRole.ADMIN];

export async function POST() {
  const session = await auth();
  try {
    assertRole(session?.user.role, MANAGER_OR_ADMIN);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const workerUrl = process.env.SYNC_WORKER_URL;
  const token = process.env.SYNC_INTERNAL_TOKEN;
  if (!workerUrl || !token) {
    return NextResponse.json({ error: "Chưa cấu hình SYNC_WORKER_URL/SYNC_INTERNAL_TOKEN" }, { status: 500 });
  }

  const res = await fetch(`${workerUrl}/sync`, {
    method: "POST",
    headers: { "x-internal-token": token },
  });
  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
