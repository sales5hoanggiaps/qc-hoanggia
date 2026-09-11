import { describe, it, expect, beforeAll } from "vitest";
import { buildStorageKey, getUploadUrl, getViewUrl, copyObject, deleteObject, ensureBucketExists } from "@qc/storage";

describe("@qc/storage (MinIO thật, chạy local)", () => {
  beforeAll(async () => {
    await ensureBucketExists();
  });

  it("upload qua presigned URL rồi tải lại đúng nội dung, xóa xong thì không tải được nữa", async () => {
    const key = buildStorageKey("TESTCODE", "test-version-1", "anh.jpg");
    const content = Buffer.from("noi dung test file anh gia");
    const uploadUrl = await getUploadUrl({ storageKey: key, mimeType: "image/jpeg", size: content.length });

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "Content-Length": String(content.length) },
      body: content,
    });
    expect(putRes.ok).toBe(true);

    const viewUrl = await getViewUrl(key);
    const getRes = await fetch(viewUrl);
    expect(getRes.ok).toBe(true);
    const downloaded = Buffer.from(await getRes.arrayBuffer());
    expect(downloaded.equals(content)).toBe(true);

    await deleteObject(key);
    const getAfterDelete = await fetch(await getViewUrl(key));
    expect(getAfterDelete.ok).toBe(false);
  });

  it("upload với Content-Length khai sai (nhỏ hơn thật) bị từ chối", async () => {
    const key = buildStorageKey("TESTCODE", "test-version-1", "video.mp4");
    const uploadUrl = await getUploadUrl({ storageKey: key, mimeType: "video/mp4", size: 10 });
    const actualContent = Buffer.alloc(1000, "x"); // lớn hơn 10 byte đã khai báo lúc xin URL

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": String(actualContent.length) },
      body: actualContent,
    });
    expect(putRes.ok).toBe(false);
  });

  it("copyObject tạo bản sao độc lập — xóa bản sao không ảnh hưởng file gốc", async () => {
    const originalKey = buildStorageKey("TESTCODE", "test-version-1", "goc.jpg");
    const copiedKey = buildStorageKey("TESTCODE", "test-version-2", "goc.jpg");
    const content = Buffer.from("noi dung goc");

    const uploadUrl = await getUploadUrl({ storageKey: originalKey, mimeType: "image/jpeg", size: content.length });
    await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "Content-Length": String(content.length) },
      body: content,
    });

    await copyObject(originalKey, copiedKey);
    await deleteObject(copiedKey);

    const res = await fetch(await getViewUrl(originalKey));
    expect(res.ok).toBe(true); // bản gốc vẫn còn nguyên sau khi xóa bản sao

    await deleteObject(originalKey);
  });
});
