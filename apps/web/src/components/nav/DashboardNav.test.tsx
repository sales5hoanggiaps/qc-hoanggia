import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserRole } from "@qc/db";
import { DashboardNav } from "./DashboardNav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

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
    expect(screen.getByText("Đồng bộ AMIS")).toBeDefined();
    expect(screen.getByText("Đăng xuất")).toBeDefined();
  });

  it("ADMIN thấy đầy đủ mọi mục kể cả Tài khoản", () => {
    render(<DashboardNav role={UserRole.ADMIN} />);
    expect(screen.getByText("Quản trị viên")).toBeDefined();
    expect(screen.getByText("Tài khoản")).toBeDefined();
    expect(screen.getByText("Đồng bộ AMIS")).toBeDefined();
    expect(screen.getByText("Đăng xuất")).toBeDefined();
  });

  it("hiển thị tên người dùng và nhãn vai trò tiếng Việt khi truyền fullName", () => {
    // Dùng role ADMIN vì nhãn của nó ("Quản trị hệ thống") không trùng chữ với bất kỳ mục nav
    // nào — role MANAGER sẽ trùng chữ với mục nav "Quản trị viên", gây getByText mơ hồ (2 khớp).
    render(<DashboardNav role={UserRole.ADMIN} fullName="Đào Minh Quân" />);
    expect(screen.getByText("Đào Minh Quân")).toBeDefined();
    expect(screen.getByText("Quản trị hệ thống")).toBeDefined();
  });

  it("mục Tìm kiếm được đánh dấu active khi đang ở trang chủ (aria-current)", () => {
    render(<DashboardNav role={UserRole.QC_STAFF} />);
    const searchLink = screen.getByText("Tìm kiếm").closest("a");
    expect(searchLink?.className).toContain("bg-brand-50");
  });
});
