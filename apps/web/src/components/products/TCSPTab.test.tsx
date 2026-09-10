import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TCSPTab } from "./TCSPTab";
import type { ProductDetail } from "@/lib/products/get-product-detail";

// TCSPTab dùng useRouter() để refresh sau khi lưu — cần mock vì jsdom test không có Next.js app
// router thật (giống pattern ProductDetailTabs.test.tsx).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function makeProduct(): ProductDetail {
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
      tcsp: { id: "t1", versionId: "v1", materialCode: "NL-GOC", description: null, preparedBy: null, approvedBy: null, approvedAt: null, specRows: [] },
      qc: null,
      packaging: null,
      documents: null,
    },
    versions: [],
  } as unknown as ProductDetail;
}

describe("TCSPTab — Huỷ reset form state (Fix 2)", () => {
  it("đổi field rồi Huỷ, vào lại chế độ sửa thì thấy giá trị GỐC chứ không phải giá trị bỏ dở", () => {
    const onDoneEditing = vi.fn();
    const { rerender } = render(<TCSPTab product={makeProduct()} editing={true} onDoneEditing={onDoneEditing} />);

    const input = screen.getByLabelText("Mã NL") as HTMLInputElement;
    expect(input.value).toBe("NL-GOC");

    fireEvent.change(input, { target: { value: "NL-BO-DO" } });
    expect(input.value).toBe("NL-BO-DO");

    // Bấm Huỷ — component không unmount, chỉ đổi prop `editing`.
    fireEvent.click(screen.getByText("Huỷ"));
    expect(onDoneEditing).toHaveBeenCalledTimes(1);

    rerender(<TCSPTab product={makeProduct()} editing={false} onDoneEditing={onDoneEditing} />);
    rerender(<TCSPTab product={makeProduct()} editing={true} onDoneEditing={onDoneEditing} />);

    const inputAgain = screen.getByLabelText("Mã NL") as HTMLInputElement;
    expect(inputAgain.value).toBe("NL-GOC");
  });
});
