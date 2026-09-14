import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { UsersPanel } from "./UsersPanel";

const users = [
  { id: "u1", fullName: "Nhân viên QC", username: "qc1", role: "QC_STAFF" as const, isActive: true },
  { id: "u2", fullName: "Quản lý", username: "mgr1", role: "MANAGER" as const, isActive: true },
  { id: "u3", fullName: "Admin gốc", username: "admin1", role: "ADMIN" as const, isActive: true },
];

describe("UsersPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ users }) }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dòng ADMIN không có nút Khoá/Mở khoá lẫn nút Cấp Quản trị viên — chỉ 2 dòng kia mới có", async () => {
    render(<UsersPanel />);
    await waitFor(() => expect(screen.getByText("Admin gốc")).toBeDefined());

    const rows = screen.getAllByRole("row");
    const adminRow = rows.find((r) => r.textContent?.includes("Admin gốc"))!;
    expect(adminRow.textContent).not.toContain("Khoá");
    expect(adminRow.textContent).not.toContain("Mở khoá");
    expect(adminRow.textContent).not.toContain("Quản trị viên");

    const qcRow = rows.find((r) => r.textContent?.includes("Nhân viên QC"))!;
    expect(qcRow.textContent).toContain("Khoá");
  });

  it("hiển thị nhãn vai trò tiếng Việt, không hiển thị mã enum thô", async () => {
    render(<UsersPanel />);
    await waitFor(() => expect(screen.getByText("Admin gốc")).toBeDefined());
    expect(screen.getByText("Quản trị hệ thống")).toBeDefined();
    expect(screen.queryByText("ADMIN")).toBeNull();
    expect(screen.queryByText("QC_STAFF")).toBeNull();
  });
});
