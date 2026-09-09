import { describe, expect, it } from "vitest";
import { UserRole } from "@qc/db";
import { assertRole, ForbiddenError } from "./guard";

describe("assertRole", () => {
  it("không ném lỗi khi vai trò nằm trong danh sách cho phép", () => {
    expect(() => assertRole(UserRole.ADMIN, [UserRole.ADMIN, UserRole.MANAGER])).not.toThrow();
  });

  it("ném ForbiddenError khi vai trò không được phép", () => {
    expect(() => assertRole(UserRole.QC_STAFF, [UserRole.ADMIN])).toThrow(ForbiddenError);
  });

  it("ném ForbiddenError khi không có vai trò (chưa đăng nhập)", () => {
    expect(() => assertRole(undefined, [UserRole.ADMIN])).toThrow(ForbiddenError);
  });
});
