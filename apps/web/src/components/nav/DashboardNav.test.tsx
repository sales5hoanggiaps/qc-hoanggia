import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserRole } from "@qc/db";
import { DashboardNav } from "./DashboardNav";

describe("DashboardNav", () => {
  it("QC_STAFF chỉ thấy Tìm kiếm và Danh sách mã hàng", () => {
    render(<DashboardNav role={UserRole.QC_STAFF} />);
    expect(screen.getByText("Tìm kiếm")).toBeDefined();
    expect(screen.getByText("Danh sách mã hàng")).toBeDefined();
    expect(screen.queryByText("Quản trị viên")).toBeNull();
    expect(screen.queryByText("Tài khoản")).toBeNull();
    expect(screen.getByText("Đăng xuất")).toBeDefined();
  });

  it("MANAGER thấy thêm mục Quản trị viên nhưng không thấy Tài khoản", () => {
    render(<DashboardNav role={UserRole.MANAGER} />);
    expect(screen.getByText("Quản trị viên")).toBeDefined();
    expect(screen.queryByText("Tài khoản")).toBeNull();
    expect(screen.getByText("Đăng xuất")).toBeDefined();
  });

  it("ADMIN thấy đầy đủ mọi mục kể cả Tài khoản", () => {
    render(<DashboardNav role={UserRole.ADMIN} />);
    expect(screen.getByText("Quản trị viên")).toBeDefined();
    expect(screen.getByText("Tài khoản")).toBeDefined();
    expect(screen.getByText("Đăng xuất")).toBeDefined();
  });
});
