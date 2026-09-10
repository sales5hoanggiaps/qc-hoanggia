import { prisma } from "@qc/db";

export interface FieldChange {
  fieldPath: string;
  oldValue: string | null;
  newValue: string | null;
}

/** So sánh 2 object cùng shape (giá trị string/null), trả về danh sách field thực sự khác nhau.
 * `before` là null khi bản ghi (vd TCSPData) chưa từng tồn tại — mọi field trong `after` khác null coi là 1 thay đổi. */
export function diffFields<T extends Record<string, string | null>>(before: T | null, after: T): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const key of Object.keys(after) as (keyof T & string)[]) {
    const oldVal = before ? before[key] : null;
    const newVal = after[key];
    if (oldVal !== newVal) {
      changes.push({ fieldPath: key, oldValue: oldVal, newValue: newVal });
    }
  }
  return changes;
}

export async function recordChanges(versionId: string, changedBy: string, changes: FieldChange[]): Promise<void> {
  if (changes.length === 0) return;
  await prisma.changeLogEntry.createMany({
    data: changes.map((c) => ({
      versionId,
      fieldPath: c.fieldPath,
      oldValue: c.oldValue,
      newValue: c.newValue,
      changedBy,
      source: "MANUAL",
    })),
  });
}
