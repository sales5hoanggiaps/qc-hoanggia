import { PutObjectCommand, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { getS3Client, getPublicS3Client, getStorageConfig, ensureBucketExists } from "./client";

const UPLOAD_URL_EXPIRY_SECONDS = 15 * 60; // đủ thời gian cho video ~200MB trên mạng chậm
const VIEW_URL_EXPIRY_SECONDS = 5 * 60; // "vài phút" theo spec §7 — không có link công khai vĩnh viễn

/** Sinh storageKey duy nhất cho 1 file thuộc 1 phiên bản cụ thể — KHÔNG dùng lại giữa các phiên bản
 * (mỗi phiên bản sở hữu file độc lập, xem spec §7 phần Kế thừa media). */
export function buildStorageKey(baseCode: string, versionId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  return `products/${baseCode}/${versionId}/${randomUUID()}-${safeName}`;
}

/** Sinh presigned PUT URL để client tải file lên thẳng MinIO. Ký cứng Content-Length/Content-Type vào
 * chữ ký — client PUT với header khác giá trị đã khai lúc xin URL sẽ bị MinIO từ chối
 * (SignatureDoesNotMatch), nhờ vậy chặn được việc khai dung lượng nhỏ rồi tải file to hơn thật. */
export async function getUploadUrl(params: { storageKey: string; mimeType: string; size: number }): Promise<string> {
  await ensureBucketExists();
  const bucket = getStorageConfig().bucket;
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: params.storageKey,
    ContentType: params.mimeType,
    ContentLength: params.size,
  });
  return getSignedUrl(getPublicS3Client(), command, { expiresIn: UPLOAD_URL_EXPIRY_SECONDS });
}

/** Link GET đã ký để xem/tải 1 file — hết hạn sau 5 phút, gọi lại mỗi khi trang được render. */
export async function getViewUrl(storageKey: string): Promise<string> {
  const bucket = getStorageConfig().bucket;
  const command = new GetObjectCommand({ Bucket: bucket, Key: storageKey });
  return getSignedUrl(getPublicS3Client(), command, { expiresIn: VIEW_URL_EXPIRY_SECONDS });
}

/** Sao chép 1 object sang storageKey mới, tức thời trên server MinIO (không tải xuống rồi tải lên
 * lại) — dùng khi kế thừa media sang phiên bản mới, để mỗi phiên bản có file độc lập. */
export async function copyObject(fromKey: string, toKey: string): Promise<void> {
  const bucket = getStorageConfig().bucket;
  await getS3Client().send(new CopyObjectCommand({ Bucket: bucket, CopySource: `${bucket}/${fromKey}`, Key: toKey }));
}

export async function deleteObject(storageKey: string): Promise<void> {
  const bucket = getStorageConfig().bucket;
  await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
}
