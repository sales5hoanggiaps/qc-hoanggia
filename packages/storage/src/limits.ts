export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];
export const ALLOWED_VIDEO_MIME = ["video/mp4"];
export const ALLOWED_DOCUMENT_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export class UploadValidationError extends Error {}

/** Kiểm tra mimeType/size khai báo trước khi cấp presigned URL cho ảnh/video (tab TCSP/QC/Đóng gói) —
 * ném `UploadValidationError`, route gọi hàm này bắt lỗi và trả 400. */
export function validateMediaUpload(mimeType: string, size: number): void {
  const isImage = ALLOWED_IMAGE_MIME.includes(mimeType);
  const isVideo = ALLOWED_VIDEO_MIME.includes(mimeType);
  if (!isImage && !isVideo) {
    throw new UploadValidationError(`Định dạng file không được hỗ trợ: ${mimeType}`);
  }
  const max = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (size <= 0 || size > max) {
    throw new UploadValidationError(`Dung lượng file vượt quá giới hạn cho phép (${Math.round(max / 1024 / 1024)}MB)`);
  }
}

/** Cùng logic cho tài liệu (tab Giấy tờ sản phẩm) — giới hạn/định dạng khác ảnh/video. */
export function validateDocumentUpload(mimeType: string, size: number): void {
  if (!ALLOWED_DOCUMENT_MIME.includes(mimeType)) {
    throw new UploadValidationError(`Định dạng file không được hỗ trợ: ${mimeType}`);
  }
  if (size <= 0 || size > MAX_DOCUMENT_BYTES) {
    throw new UploadValidationError(`Dung lượng file vượt quá giới hạn cho phép (${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)}MB)`);
  }
}
