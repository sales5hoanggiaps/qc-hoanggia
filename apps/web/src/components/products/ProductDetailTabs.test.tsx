import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UserRole } from "@qc/db";
import { ProductDetailTabs } from "./ProductDetailTabs";
import type { ProductDetail } from "@/lib/products/get-product-detail";

// TCSPTab (rendered mặc định ở tab đầu tiên) dùng useRouter() để refresh sau khi lưu —
// cần mock vì jsdom test không có Next.js app router thật.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function makeProduct(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: "p1",
    baseCode: "SI99999",
    amisProductId: "code:SI99999",
    categoryId: null,
    category: null,
    status: "PENDING_QC",
    currentVersionId: "v1",
    createdAt: new Date(),
    updatedAt: new Date(),
    currentVersion: {
      id: "v1",
      productId: "p1",
      versionNumber: 1,
      amisProductId: "code:SI99999",
      name: "Sản phẩm test",
      description: null,
      isCurrent: true,
      createdByAmisSync: true,
      createdAt: new Date(),
      tcsp: null,
      qc: null,
      packaging: null,
      documents: null,
    },
    versions: [],
    ...overrides,
  } as ProductDetail;
}

describe("ProductDetailTabs", () => {
  it("QC_STAFF thấy 5 tab nhưng không thấy nút Chỉnh sửa", () => {
    render(<ProductDetailTabs product={makeProduct()} role={UserRole.QC_STAFF} />);
    for (const label of ["Tiêu chuẩn sản phẩm", "QC sản phẩm", "Quy cách đóng gói", "Giấy tờ sản phẩm", "Lịch sử phiên bản"]) {
      expect(screen.getByText(label)).toBeDefined();
    }
    expect(screen.queryByText("Chỉnh sửa")).toBeNull();
  });

  it("MANAGER thấy nút Chỉnh sửa ở tab TCSP (tab mặc định)", () => {
    render(<ProductDetailTabs product={makeProduct()} role={UserRole.MANAGER} />);
    expect(screen.getByText("Chỉnh sửa")).toBeDefined();
  });

  it("chuyển sang tab Lịch sử phiên bản thì không còn nút Chỉnh sửa (tab đó không sửa được)", () => {
    render(<ProductDetailTabs product={makeProduct()} role={UserRole.MANAGER} />);
    fireEvent.click(screen.getByText("Lịch sử phiên bản"));
    expect(screen.queryByText("Chỉnh sửa")).toBeNull();
  });
});
