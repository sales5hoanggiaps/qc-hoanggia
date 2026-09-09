/**
 * Mẫu regex đã kiểm chứng khớp 100% trên 1000 mã hàng thật lấy từ AMIS
 * (2026-09-09, xem spec §6). Phần trước dấu chấm bắt buộc 4-7 chữ số để
 * loại trừ kiểu đánh số nội bộ khác của AMIS (vd "AA03.000170" — chỉ 2
 * chữ số trước dấu chấm, số sau dấu chấm dài và có số 0 ở đầu).
 */
const VERSION_SUFFIX_RE = /^([A-Z]{1,4}\d{4,7})\.(\d{1,2})$/;

export function parseVersionSuffix(
  code: string
): { baseCode: string; versionNumber: number } | null {
  const match = code.match(VERSION_SUFFIX_RE);
  if (!match) return null;
  return { baseCode: match[1], versionNumber: Number(match[2]) };
}
