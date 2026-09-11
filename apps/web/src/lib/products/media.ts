import type { PrismaTransactionClient } from "@qc/db";

export type MediaTab = "tcsp" | "qc" | "packaging";

/** Đảm bảo bản ghi TCSPData/QCData/PackagingData của phiên bản đã tồn tại (tạo rỗng nếu chưa — người
 * dùng có thể muốn upload ảnh trước khi nhập nội dung văn bản), trả về id để gắn MediaAsset. */
export async function resolveMediaParentId(tx: PrismaTransactionClient, versionId: string, tab: MediaTab): Promise<string> {
  switch (tab) {
    case "tcsp": {
      const row = await tx.tCSPData.upsert({ where: { versionId }, update: {}, create: { versionId } });
      return row.id;
    }
    case "qc": {
      const row = await tx.qCData.upsert({ where: { versionId }, update: {}, create: { versionId } });
      return row.id;
    }
    case "packaging": {
      const row = await tx.packagingData.upsert({ where: { versionId }, update: {}, create: { versionId } });
      return row.id;
    }
  }
}

export function mediaForeignKeyField(tab: MediaTab): "tcspId" | "qcId" | "packagingId" {
  return tab === "tcsp" ? "tcspId" : tab === "qc" ? "qcId" : "packagingId";
}
