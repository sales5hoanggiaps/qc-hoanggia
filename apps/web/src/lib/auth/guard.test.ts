import { describe, expect, it } from "vitest";
import { UserRole } from "@qc/db";
import { assertRole, ForbiddenError, PRODUCT_EDITORS } from "./guard";

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

  it("PRODUCT_EDITORS cho phép ADMIN, MANAGER, SALES_STAFF nhưng chặn QC_STAFF", () => {
    expect(() => assertRole(UserRole.ADMIN, PRODUCT_EDITORS)).not.toThrow();
    expect(() => assertRole(UserRole.MANAGER, PRODUCT_EDITORS)).not.toThrow();
    expect(() => assertRole(UserRole.SALES_STAFF, PRODUCT_EDITORS)).not.toThrow();
    expect(() => assertRole(UserRole.QC_STAFF, PRODUCT_EDITORS)).toThrow(ForbiddenError);
  });
});
