import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ManualSyncButton } from "./ManualSyncButton";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

describe("ManualSyncButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hiển thị nút Đồng bộ AMIS", () => {
    render(<ManualSyncButton />);
    expect(screen.getByRole("button", { name: /Đồng bộ AMIS/i })).toBeDefined();
  });

  it("gọi /api/admin/sync và hiển thị trạng thái đang đồng bộ khi bấm", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ newProducts: 1, newVersions: 2 }),
      }))
    );

    render(<ManualSyncButton />);
    const btn = screen.getByRole("button", { name: /Đồng bộ AMIS/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/admin/sync", { method: "POST" });
      expect(mockRefresh).toHaveBeenCalled();
      expect(screen.getByText(/Đồng bộ thành công/i)).toBeDefined();
    });

    vi.unstubAllGlobals();
  });
});
