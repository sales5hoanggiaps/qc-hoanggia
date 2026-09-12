import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DocumentsTab } from "./DocumentsTab";
import type { ProductDetail } from "@/lib/products/get-product-detail";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function makeFile() {
  return new File(["noi dung"], "coa.pdf", { type: "application/pdf" });
}

function makeProduct(): ProductDetail {
  return {
    id: "p1",
    baseCode: "SI1",
    amisProductId: "code:SI1",
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
      amisProductId: "code:SI1",
      name: "Sản phẩm test",
      description: null,
      isCurrent: true,
      createdByAmisSync: true,
      createdAt: new Date(),
      tcsp: null,
      qc: null,
      packaging: null,
      documents: { id: "d1", versionId: "v1", files: [{ id: "f1", documentsId: "d1", kind: "COA", label: "COA lô 1", storageKey: "products/SI1/v1/coa.pdf", uploadedAt: new Date() }] },
    },
    versions: [],
  } as unknown as ProductDetail;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("DocumentsTab", () => {
  it("chế độ xem không hiện nút Xoá", () => {
    render(<DocumentsTab product={makeProduct()} editing={false} onDoneEditing={vi.fn()} mediaUrls={{}} />);
    expect(screen.getByText(/COA lô 1/)).toBeDefined();
    expect(screen.queryByText("Xoá")).toBeNull();
  });

  it("chế độ sửa, bấm chọn file khi chưa nhập tên tài liệu → báo lỗi, không gọi fetch", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<DocumentsTab product={makeProduct()} editing={true} onDoneEditing={vi.fn()} mediaUrls={{}} />);

    const input = screen.getByLabelText("+ Chọn file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => expect(screen.getByText("Nhập tên tài liệu trước khi chọn file.")).toBeDefined());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("nhập tên rồi chọn file → gọi đủ 3 fetch đúng thứ tự", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/documents/upload-url")) {
        return new Response(JSON.stringify({ uploadUrl: "https://minio.local/put-here", storageKey: "products/SI1/v1/abc-coa.pdf" }), { status: 200 });
      }
      if (String(url) === "https://minio.local/put-here") {
        return new Response(null, { status: 200 });
      }
      if (String(url).endsWith("/documents")) {
        return new Response(JSON.stringify({ id: "d2" }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const onDoneEditing = vi.fn();
    render(<DocumentsTab product={makeProduct()} editing={true} onDoneEditing={onDoneEditing} mediaUrls={{}} />);

    const labelInput = screen.getByLabelText("Tên tài liệu") as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: "COA lô 2" } });

    const input = screen.getByLabelText("+ Chọn file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => expect(calls).toHaveLength(3));

    expect(calls[0].url).toBe("/api/products/SI1/documents/upload-url");
    expect(JSON.parse(calls[0].init!.body as string)).toEqual({ fileName: "coa.pdf", mimeType: "application/pdf", size: 8 });

    expect(calls[1].url).toBe("https://minio.local/put-here");
    expect(calls[1].init!.method).toBe("PUT");

    expect(calls[2].url).toBe("/api/products/SI1/documents");
    expect(JSON.parse(calls[2].init!.body as string)).toEqual({
      storageKey: "products/SI1/v1/abc-coa.pdf",
      kind: "COA",
      label: "COA lô 2",
    });
  });
});
