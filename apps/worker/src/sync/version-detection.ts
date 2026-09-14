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

/**
 * Ngưỡng độ tương tự Jaccard (giao/hợp trên tập token đã chuẩn hoá) — dưới ngưỡng này coi là "trôi tên
 * lớn" (xem spec §12.1). Chọn 0.3 dựa trên các ví dụ thật đã ghi nhận ở spec §12: 4/5 ca trôi lớn đã
 * biết (SI06877/SI06878, SI00035, AA03979) rơi dưới 0.1; các ca chỉ đổi lô/cách gọi rơi trên 0.7.
 *
 * Ceiling đã biết (ghi trong spec §12.1): kiểu trôi như SI08201 (khuôn câu chung, chỉ đổi tên khách
 * hàng ở cuối câu) giữ độ tương tự CAO vì phần khuôn câu chung chiếm đa số token — heuristic này KHÔNG
 * bắt chắc chắn được kiểu đó. Chấp nhận, không xử lý trong phạm vi này.
 */
export const NAME_DRIFT_THRESHOLD = 0.3;

function tokenize(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 0)
  );
}

export function detectNameDrift(oldName: string, newName: string): boolean {
  const oldTokens = tokenize(oldName);
  const newTokens = tokenize(newName);
  if (oldTokens.size === 0 || newTokens.size === 0) return false;

  let intersectionSize = 0;
  for (const token of oldTokens) {
    if (newTokens.has(token)) intersectionSize++;
  }
  const unionSize = new Set([...oldTokens, ...newTokens]).size;

  return intersectionSize / unionSize < NAME_DRIFT_THRESHOLD;
}
