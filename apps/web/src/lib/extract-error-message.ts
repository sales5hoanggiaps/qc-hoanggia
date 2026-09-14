/** API route trong app này trả lỗi ở 2 dạng khác nhau: chuỗi đơn giản (vd `ForbiddenError`,
 * "Không tìm thấy mã hàng") hoặc object `zod`'s `.flatten()` (khi validate input thất bại — có
 * `formErrors`/`fieldErrors`). Hàm này rút ra 1 câu hiển thị được cho người dùng từ cả 2 dạng,
 * để form không còn hiện chung 1 câu "Lưu thất bại — thử lại" mơ hồ cho mọi loại lỗi. */
export function extractErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object" || !("error" in body)) return fallback;
  const err = (body as { error: unknown }).error;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const flat = err as { formErrors?: string[]; fieldErrors?: Record<string, string[] | undefined> };
    if (flat.formErrors?.length) return flat.formErrors[0];
    if (flat.fieldErrors) {
      for (const messages of Object.values(flat.fieldErrors)) {
        if (messages?.length) return messages[0];
      }
    }
  }
  return fallback;
}
