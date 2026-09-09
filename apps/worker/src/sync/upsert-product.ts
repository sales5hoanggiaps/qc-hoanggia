import { prisma, ProductStatus } from "@qc/db";
import { parseVersionSuffix } from "./version-detection";

export interface UpsertProductInput {
  amisProductId: string;
  code: string;
  name: string;
  description: string | null;
}

export type UpsertResult = { kind: "created" | "new_version" | "linked_existing" };

/** Sao chép nội dung 4 mục từ 1 ProductVersion sang 1 ProductVersion mới (cùng dữ liệu, khoá ngoại mới). */
async function cloneVersionContent(fromVersionId: string, toVersionId: string) {
  const [tcsp, qc, packaging, documents] = await Promise.all([
    prisma.tCSPData.findUnique({ where: { versionId: fromVersionId }, include: { specRows: true, media: true } }),
    prisma.qCData.findUnique({ where: { versionId: fromVersionId }, include: { media: true } }),
    prisma.packagingData.findUnique({ where: { versionId: fromVersionId }, include: { media: true } }),
    prisma.documentsData.findUnique({ where: { versionId: fromVersionId }, include: { files: true } }),
  ]);

  if (tcsp) {
    const newTcsp = await prisma.tCSPData.create({
      data: {
        versionId: toVersionId,
        materialCode: tcsp.materialCode,
        description: tcsp.description,
        preparedBy: tcsp.preparedBy,
        approvedBy: tcsp.approvedBy,
        approvedAt: tcsp.approvedAt,
      },
    });
    for (const row of tcsp.specRows) {
      await prisma.tCSPSpecRow.create({
        data: {
          tcspId: newTcsp.id,
          groupName: row.groupName,
          criterion: row.criterion,
          value: row.value,
          tolerance: row.tolerance,
          unit: row.unit,
          note: row.note,
          sortOrder: row.sortOrder,
        },
      });
    }
    for (const media of tcsp.media) {
      await prisma.mediaAsset.create({
        data: { storageKey: media.storageKey, mimeType: media.mimeType, caption: media.caption, sortOrder: media.sortOrder, tcspId: newTcsp.id },
      });
    }
  }

  if (qc) {
    const newQc = await prisma.qCData.create({
      data: { versionId: toVersionId, checklist: qc.checklist, knownDefects: qc.knownDefects, specialNotes: qc.specialNotes },
    });
    for (const media of qc.media) {
      await prisma.mediaAsset.create({
        data: { storageKey: media.storageKey, mimeType: media.mimeType, caption: media.caption, sortOrder: media.sortOrder, qcId: newQc.id },
      });
    }
  }

  if (packaging) {
    const newPackaging = await prisma.packagingData.create({
      data: { versionId: toVersionId, instructions: packaging.instructions, specialNotes: packaging.specialNotes },
    });
    for (const media of packaging.media) {
      await prisma.mediaAsset.create({
        data: { storageKey: media.storageKey, mimeType: media.mimeType, caption: media.caption, sortOrder: media.sortOrder, packagingId: newPackaging.id },
      });
    }
  }

  if (documents) {
    const newDocuments = await prisma.documentsData.create({ data: { versionId: toVersionId } });
    for (const file of documents.files) {
      await prisma.productDocument.create({
        data: { documentsId: newDocuments.id, kind: file.kind, label: file.label, storageKey: file.storageKey },
      });
    }
  }
}

export async function upsertProductFromAmis(input: UpsertProductInput): Promise<UpsertResult> {
  const existingByAmisId = await prisma.product.findUnique({ where: { amisProductId: input.amisProductId } });
  if (existingByAmisId) {
    return { kind: "linked_existing" };
  }

  const parsed = parseVersionSuffix(input.code);
  const existingBase = parsed ? await prisma.product.findUnique({
    where: { baseCode: parsed.baseCode },
    include: { currentVersion: true },
  }) : null;

  if (parsed && existingBase && existingBase.currentVersion) {
    // Phiên bản mới của mã đã tồn tại — kế thừa nội dung, tạo bản ghi mới, không đụng bản cũ.
    const newVersion = await prisma.productVersion.create({
      data: {
        productId: existingBase.id,
        versionNumber: existingBase.currentVersion.versionNumber + 1,
        amisProductId: input.amisProductId,
        name: input.name,
        description: input.description,
        isCurrent: true,
        createdByAmisSync: true,
      },
    });
    await cloneVersionContent(existingBase.currentVersion.id, newVersion.id);
    await prisma.productVersion.update({ where: { id: existingBase.currentVersion.id }, data: { isCurrent: false } });
    await prisma.product.update({ where: { id: existingBase.id }, data: { currentVersionId: newVersion.id } });
    await prisma.changeLogEntry.create({
      data: {
        versionId: newVersion.id,
        fieldPath: "version",
        oldValue: String(existingBase.currentVersion.versionNumber),
        newValue: String(newVersion.versionNumber),
        source: "AMIS_SYNC",
      },
    });
    return { kind: "new_version" };
  }

  // Mã hoàn toàn mới (không khớp mẫu phiên bản, hoặc baseCode chưa từng thấy).
  const baseCode = parsed ? parsed.baseCode : input.code;
  const product = await prisma.product.create({
    data: {
      baseCode,
      amisProductId: input.amisProductId,
      status: ProductStatus.PENDING_QC,
    },
  });
  const version = await prisma.productVersion.create({
    data: {
      productId: product.id,
      versionNumber: 1,
      amisProductId: input.amisProductId,
      name: input.name,
      description: input.description,
      isCurrent: true,
      createdByAmisSync: true,
    },
  });
  await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: version.id } });
  return { kind: "created" };
}
