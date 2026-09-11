import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MediaUploader } from "./MediaUploader";

function makeFile() {
  return new File(["noi dung"], "anh.jpg", { type: "image/jpeg" });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("MediaUploader — luồng tải lên", () => {
  it("gọi đúng thứ tự upload-url → PUT → media, đúng payload, rồi gọi onChanged", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/media/upload-url")) {
        return new Response(JSON.stringify({ uploadUrl: "https://minio.local/put-here", storageKey: "products/SI1/v1/abc-anh.jpg" }), { status: 200 });
      }
      if (String(url) === "https://minio.local/put-here") {
        return new Response(null, { status: 200 });
      }
      if (String(url).endsWith("/media")) {
        return new Response(JSON.stringify({ id: "m1" }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const onChanged = vi.fn();
    render(<MediaUploader baseCode="SI1" tab="tcsp" media={[]} mediaUrls={{}} onChanged={onChanged} />);

    const input = screen.getByLabelText("+ Chọn file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));

    expect(calls).toHaveLength(3);
    expect(calls[0].url).toBe("/api/products/SI1/media/upload-url");
    expect(JSON.parse(calls[0].init!.body as string)).toEqual({ tab: "tcsp", fileName: "anh.jpg", mimeType: "image/jpeg", size: 8 });

    expect(calls[1].url).toBe("https://minio.local/put-here");
    expect(calls[1].init!.method).toBe("PUT");

    expect(calls[2].url).toBe("/api/products/SI1/media");
    expect(JSON.parse(calls[2].init!.body as string)).toEqual({
      tab: "tcsp",
      storageKey: "products/SI1/v1/abc-anh.jpg",
      mimeType: "image/jpeg",
      caption: null,
      sortOrder: 0,
    });
  });

  it("nếu PUT thất bại thì KHÔNG gọi bước tạo MediaAsset, và không gọi onChanged", async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string) => {
      calls.push(String(url));
      if (String(url).endsWith("/media/upload-url")) {
        return new Response(JSON.stringify({ uploadUrl: "https://minio.local/put-here", storageKey: "products/SI1/v1/abc-anh.jpg" }), { status: 200 });
      }
      if (String(url) === "https://minio.local/put-here") {
        return new Response(null, { status: 500 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const onChanged = vi.fn();
    render(<MediaUploader baseCode="SI1" tab="tcsp" media={[]} mediaUrls={{}} onChanged={onChanged} />);

    const input = screen.getByLabelText("+ Chọn file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => expect(screen.getByText("Tải file lên thất bại")).toBeDefined());

    expect(calls).toEqual(["/api/products/SI1/media/upload-url", "https://minio.local/put-here"]);
    expect(onChanged).not.toHaveBeenCalled();
  });
});
