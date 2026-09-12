// Mẫu regex đã kiểm chứng khớp 100% trên 1000 mã hàng thật lấy từ AMIS (xem spec §6 và
// apps/worker/src/sync/version-detection.ts — bản gốc dùng cho đồng bộ). Bản này thêm
// .toUpperCase() vì input ở đây do NGƯỜI DÙNG gõ tay trong ô tìm kiếm (worker luôn nhận
// input đã đúng hoa từ AMIS, không cần bước này).
const VERSION_SUFFIX_RE = /^([A-Z]{1,4}\d{4,7})\.(\d{1,2})$/;

export function parseVersionSuffix(code: string): { baseCode: string; versionNumber: number } | null {
  const match = code.trim().toUpperCase().match(VERSION_SUFFIX_RE);
  if (!match) return null;
  return { baseCode: match[1], versionNumber: Number(match[2]) };
}
