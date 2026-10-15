import { UserRole } from "@qc/db";

export class ForbiddenError extends Error {
  constructor(message = "Không đủ quyền truy cập") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export const PRODUCT_EDITORS: UserRole[] = [UserRole.MANAGER, UserRole.ADMIN, UserRole.SALES_STAFF];

export function assertRole(role: UserRole | undefined, allowed: UserRole[]): void {
  if (!role || !allowed.includes(role)) {
    throw new ForbiddenError();
  }
}
