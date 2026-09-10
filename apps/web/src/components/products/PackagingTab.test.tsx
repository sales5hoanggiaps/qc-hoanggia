import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PackagingTab } from "./PackagingTab";
import type { ProductDetail } from "@/lib/products/get-product-detail";

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
      tcsp: null,
      qc: null,
      packaging: { id: "pk1", versionId: "v1", instructions: "Hướng dẫn gốc", specialNotes: null },
      documents: null,
    },
    versions: [],
  } as unknown as ProductDetail;
}

describe("PackagingTab — Huỷ reset form state (Fix 2)", () => {
  it("đổi field rồi Huỷ, vào lại chế độ sửa thì thấy giá trị GỐC chứ không phải giá trị bỏ dở", () => {
    const onDoneEditing = vi.fn();
    const { rerender } = render(<PackagingTab product={makeProduct()} editing={true} onDoneEditing={onDoneEditing} />);

    const textarea = screen.getByLabelText("Hướng dẫn đóng gói") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Hướng dẫn gốc");

    fireEvent.change(textarea, { target: { value: "Bỏ dở chưa lưu" } });
    expect(textarea.value).toBe("Bỏ dở chưa lưu");

    fireEvent.click(screen.getByText("Huỷ"));
    expect(onDoneEditing).toHaveBeenCalledTimes(1);

    rerender(<PackagingTab product={makeProduct()} editing={false} onDoneEditing={onDoneEditing} />);
    rerender(<PackagingTab product={makeProduct()} editing={true} onDoneEditing={onDoneEditing} />);

    const textareaAgain = screen.getByLabelText("Hướng dẫn đóng gói") as HTMLTextAreaElement;
    expect(textareaAgain.value).toBe("Hướng dẫn gốc");
  });
});
