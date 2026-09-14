import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UserRole } from "@qc/db";
import { HistoryTab } from "./HistoryTab";
import type { ProductDetail } from "@/lib/products/get-product-detail";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function makeVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    productId: "p1",
    versionNumber: 2,
    amisProductId: "code:X.2",
    name: "Tem giấy cán bóng Nước muối Sao Mai 500ml",
    description: null,
    isCurrent: true,
    createdByAmisSync: true,
    createdAt: new Date(),
    needsInheritanceReview: true,
    changeLogs: [],
    tcsp: null,
    qc: null,
    packaging: null,
    documents: null,
    ...overrides,
  };
}

function makeProduct(versions: ReturnType<typeof makeVersion>[]): ProductDetail {
  return { baseCode: "SI00035", versions } as unknown as ProductDetail;
}

beforeEach(() => {
  refresh.mockClear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
});

describe("HistoryTab", () => {
  it("hiện badge cảnh báo khi needsInheritanceReview true", () => {
    render(<HistoryTab product={makeProduct([makeVersion()])} role={UserRole.QC_STAFF} />);
    expect(screen.getByText(/Cần xác nhận kế thừa/)).toBeDefined();
  });

  it("KHÔNG hiện badge khi needsInheritanceReview false", () => {
    render(<HistoryTab product={makeProduct([makeVersion({ needsInheritanceReview: false })])} role={UserRole.QC_STAFF} />);
    expect(screen.queryByText(/Cần xác nhận kế thừa/)).toBeNull();
  });

  it("QC_STAFF thấy badge nhưng KHÔNG thấy nút xác nhận", () => {
    render(<HistoryTab product={makeProduct([makeVersion()])} role={UserRole.QC_STAFF} />);
    expect(screen.queryByText("Xác nhận đã kiểm tra")).toBeNull();
  });

  it("MANAGER thấy nút xác nhận, bấm vào gọi đúng endpoint và refresh", async () => {
    render(<HistoryTab product={makeProduct([makeVersion()])} role={UserRole.MANAGER} />);
    fireEvent.click(screen.getByText("Xác nhận đã kiểm tra"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/products/SI00035/versions/2/confirm-inheritance",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("hiện thông báo lỗi khi PATCH thất bại, không refresh", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Lỗi test" }) }));
    render(<HistoryTab product={makeProduct([makeVersion()])} role={UserRole.MANAGER} />);
    fireEvent.click(screen.getByText("Xác nhận đã kiểm tra"));
    await waitFor(() => expect(screen.getByText("Lỗi test")).toBeDefined());
    expect(refresh).not.toHaveBeenCalled();
  });
});
