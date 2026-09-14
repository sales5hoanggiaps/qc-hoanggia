import { prisma, ProductStatus, type PrismaTransactionClient } from "@qc/db";
import { parseVersionSuffix, detectNameDrift } from "./version-detection";
import { copyObject, buildStorageKey } from "@qc/storage";
import { logger } from "../logger";

export interface UpsertProductInput {
  amisProductId: string;
  code: string;
  name: string;
  description: string | null;
}

export type UpsertResult =
  | { kind: "created" | "new_version"; productId: string }
  | { kind: "linked_existing"; productId: string; duplicateVersionNumber?: boolean };

/** Trích tên file gốc từ storageKey (dạng products/<baseCode>/<versionId>/<uuid>-<tênfile>) để giữ
 * nguyên tên khi sinh storageKey mới cho phiên bản kế thừa. */
function extractFileName(storageKey: string): string {
  const lastSegment = storageKey.split("/").pop() ?? storageKey;
  const dashIndex = lastSegment.indexOf("-");
  return dashIndex >= 0 ? lastSegment.slice(dashIndex + 1) : lastSegment;
}

/** Sao chép 1 file MinIO sang storageKey mới độc lập cho phiên bản mới (xem spec §7 — mỗi phiên bản
 * phải sở hữu file riêng, không dùng chung storageKey, vì media bị xóa hẳn khi người dùng xóa).
 * Lỗi copy 1 file KHÔNG được làm hỏng cả lần đồng bộ — trả `null`, bên gọi bỏ qua đúng file đó. */
async function copyMediaFile(baseCode: string, toVersionId: string, oldStorageKey: string): Promise<string | null> {
  const newKey = buildStorageKey(baseCode, toVersionId, extractFileName(oldStorageKey));
  try {
    await copyObject(oldStorageKey, newKey);
    return newKey;
  } catch (err) {
    logger.warn(`Không sao chép được file ${oldStorageKey} sang phiên bản mới — bỏ qua, giữ lại các file khác:`, err);
    return null;
  }
}

/** Sao chép nội dung 4 mục từ 1 ProductVersion sang 1 ProductVersion mới (cùng dữ liệu, khoá ngoại mới).
 * Nhận `tx` (Prisma transaction client) thay vì dùng `prisma` toàn cục, để toàn bộ việc đọc/ghi bên
 * trong hàm này atomic cùng với phần còn lại của giao dịch gọi nó (xem upsertProductFromAmis). */
async function cloneVersionContent(tx: PrismaTransactionClient, fromVersionId: string, toVersionId: string, baseCode: string) {
  const [tcsp, qc, packaging, documents] = await Promise.all([
    tx.tCSPData.findUnique({ where: { versionId: fromVersionId }, include: { specRows: true, media: true } }),
    tx.qCData.findUnique({ where: { versionId: fromVersionId }, include: { media: true } }),
    tx.packagingData.findUnique({ where: { versionId: fromVersionId }, include: { media: true } }),
    tx.documentsData.findUnique({ where: { versionId: fromVersionId }, include: { files: true } }),
  ]);

  if (tcsp) {
    const newTcsp = await tx.tCSPData.create({
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
      await tx.tCSPSpecRow.create({
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
      const newKey = await copyMediaFile(baseCode, toVersionId, media.storageKey);
      if (newKey) {
        await tx.mediaAsset.create({
          data: { storageKey: newKey, mimeType: media.mimeType, caption: media.caption, sortOrder: media.sortOrder, tcspId: newTcsp.id },
        });
      }
    }
  }

  if (qc) {
    const newQc = await tx.qCData.create({
      data: { versionId: toVersionId, checklist: qc.checklist, knownDefects: qc.knownDefects, specialNotes: qc.specialNotes },
    });
    for (const media of qc.media) {
      const newKey = await copyMediaFile(baseCode, toVersionId, media.storageKey);
      if (newKey) {
        await tx.mediaAsset.create({
          data: { storageKey: newKey, mimeType: media.mimeType, caption: media.caption, sortOrder: media.sortOrder, qcId: newQc.id },
        });
      }
    }
  }

  if (packaging) {
    const newPackaging = await tx.packagingData.create({
      data: { versionId: toVersionId, instructions: packaging.instructions, specialNotes: packaging.specialNotes },
    });
    for (const media of packaging.media) {
      const newKey = await copyMediaFile(baseCode, toVersionId, media.storageKey);
      if (newKey) {
        await tx.mediaAsset.create({
          data: { storageKey: newKey, mimeType: media.mimeType, caption: media.caption, sortOrder: media.sortOrder, packagingId: newPackaging.id },
        });
      }
    }
  }

  if (documents) {
    const newDocuments = await tx.documentsData.create({ data: { versionId: toVersionId } });
    for (const file of documents.files) {
      const newKey = await copyMediaFile(baseCode, toVersionId, file.storageKey);
      if (newKey) {
        await tx.productDocument.create({
          data: { documentsId: newDocuments.id, kind: file.kind, label: file.label, storageKey: newKey },
        });
      }
    }
  }
}

export async function upsertProductFromAmis(input: UpsertProductInput): Promise<UpsertResult> {
  const existingVersion = await prisma.productVersion.findUnique({ where: { amisProductId: input.amisProductId } });
  if (existingVersion) {
    return { kind: "linked_existing", productId: existingVersion.productId };
  }

  const parsed = parseVersionSuffix(input.code);
  const candidateBaseCode = parsed ? parsed.baseCode : input.code;
  const existingBase = await prisma.product.findUnique({
    where: { baseCode: candidateBaseCode },
    include: { currentVersion: true },
  });

  if (existingBase && existingBase.currentVersion && !parsed) {
    // Mã trần (không có hậu tố version) trùng đúng baseCode của 1 Product đã
    // tồn tại — thường do 1 mã có version của cùng gốc đã tạo Product này
    // trước đó trong cùng lần sync (mã trần xuất hiện sau, ở 1 đơn hàng
    // khác). Không có gì mới để tạo — không tạo thêm Product hay
    // ProductVersion, tránh đụng unique constraint Product.baseCode.
    return { kind: "linked_existing", productId: existingBase.id };
  }

  if (parsed && existingBase && existingBase.currentVersion) {
    // Phiên bản mới của mã đã tồn tại. `parsed.versionNumber` là hậu tố
    // `.N` THẬT do AMIS gán (không phải 1 bộ đếm nội bộ tăng dần theo thứ
    // tự sync gặp mã) — dùng trực tiếp làm ProductVersion.versionNumber để
    // Product.currentVersion luôn phản ánh đúng phiên bản AMIS mới nhất,
    // bất kể thứ tự sync xử lý các mã theo modified_date DESC thế nào.
    const currentVersion = existingBase.currentVersion;
    return prisma.$transaction(
      async (tx) => {
        // Phát hiện trên dữ liệu thật (2026-09-10, xem final-fix-wave-report):
        // 1 baseCode có thể founding bằng mã TRẦN (không hậu tố, versionNumber
        // mặc định gán = 1), rồi VỀ SAU 1 đơn hàng khác dùng đúng mã đó nhưng
        // VIẾT CÓ hậu tố `.1` thật (vd "SI07276" founding version 1, sau đó
        // "SI07276.1" xuất hiện) — đây là 2 cách viết khác nhau của CÙNG 1
        // khái niệm "phiên bản 1", không phải 2 phiên bản khác nhau, nên
        // versionNumber trùng nhau là chuyện bình thường, không phải bất
        // thường dữ liệu. Kiểm tra xem versionNumber này đã tồn tại cho
        // Product này chưa (dù là bản current hay bản lịch sử không current)
        // TRƯỚC khi tạo — nếu đã có, không có gì mới để ghi, trả về
        // linked_existing (an toàn — không tạo dòng trùng, không ném lỗi).
        // Chỉ khi versionNumber THỰC SỰ chưa từng xuất hiện cho Product này
        // (trường hợp còn lại: 2 hậu tố .N khác nhau về mặt chữ nhưng lại
        // parse ra cùng 1 số — vd ".01" và ".1" — thực tế cực hiếm) mới tiếp
        // tục tạo dòng mới; unique constraint vẫn là lưới an toàn cuối cùng.
        const existingWithSameNumber = await tx.productVersion.findFirst({
          where: { productId: existingBase.id, versionNumber: parsed.versionNumber },
        });
        if (existingWithSameNumber) {
          // Gắn cờ và ghi log rõ ràng thay vì âm thầm bỏ qua (phát hiện ở final-fix-wave-report,
          // xem spec §12): trường hợp này có nghĩa là mã AMIS `input.code` mang 1 số hậu tố `.N` đã
          // TỪNG xuất hiện cho baseCode này rồi — hoặc là do AMIS gửi lại đúng mã cũ (vô hại), hoặc
          // là dấu hiệu mã gốc đang bị dùng lại cho lô/khách hàng khác (như case SI08201/AA03979 đã
          // ghi nhận) mà lần này lại trùng đúng số hậu tố với 1 phiên bản đã có — MANAGER/ADMIN nên
          // tự rà lại thủ công, không có cách nào worker tự phân biệt 2 khả năng này.
          logger.warn(
            `Mã AMIS ${input.amisProductId} (${input.code}) bị bỏ qua khi đồng bộ — versionNumber ${parsed.versionNumber} đã tồn tại sẵn cho mã gốc ${existingBase.baseCode} (ProductVersion.id=${existingWithSameNumber.id}). Không tạo phiên bản mới; cần rà soát thủ công xem đây có phải trường hợp mã gốc bị dùng lại (xem spec §12) hay không.`
          );
          return { kind: "linked_existing" as const, productId: existingBase.id, duplicateVersionNumber: true };
        }

        // Chỉ khi số phiên bản mới LỚN HƠN số hiện tại thì đây mới thật sự
        // là bản mới hơn — nếu nhỏ hơn, đây là 1 mã AMIS cũ hơn vừa được
        // phát hiện; vẫn ghi nhận lại (tab Lịch sử phiên bản sau này cần
        // thấy nó) nhưng không được ghi đè currentVersion đang có.
        const becomesNewCurrent = parsed.versionNumber > currentVersion.versionNumber;
        const nameDrifted = detectNameDrift(currentVersion.name, input.name);

        const newVersion = await tx.productVersion.create({
          data: {
            productId: existingBase.id,
            versionNumber: parsed.versionNumber,
            amisProductId: input.amisProductId,
            name: input.name,
            description: input.description,
            isCurrent: becomesNewCurrent,
            createdByAmisSync: true,
            needsInheritanceReview: nameDrifted,
          },
        });
        // Luôn kế thừa nội dung từ phiên bản ĐANG là currentVersion (nội dung tốt nhất hiện có),
        // dù bản mới này có trở thành current hay không — 1 phiên bản cũ mới phát hiện vẫn nên
        // có sẵn 1 baseline nội dung thay vì trống trơn.
        await cloneVersionContent(tx, currentVersion.id, newVersion.id, existingBase.baseCode);

        // Ghi vết audit khi tên trôi lớn (spec §12.1) — độc lập với becomesNewCurrent, vì cờ cảnh báo
        // áp dụng cho MỌI ProductVersion mới tạo, không riêng bản trở thành current.
        if (nameDrifted) {
          await tx.changeLogEntry.create({
            data: {
              versionId: newVersion.id,
              fieldPath: "nameDrift",
              oldValue: currentVersion.name,
              newValue: input.name,
              source: "AMIS_SYNC",
            },
          });
        }

        if (becomesNewCurrent) {
          await tx.productVersion.update({ where: { id: currentVersion.id }, data: { isCurrent: false } });
          await tx.product.update({ where: { id: existingBase.id }, data: { currentVersionId: newVersion.id } });
          await tx.changeLogEntry.create({
            data: {
              versionId: newVersion.id,
              fieldPath: "version",
              oldValue: String(currentVersion.versionNumber),
              newValue: String(newVersion.versionNumber),
              source: "AMIS_SYNC",
            },
          });
        }

        return { kind: "new_version" as const, productId: existingBase.id };
      },
      { timeout: 20000 } // tăng từ 10000 — cloneVersionContent giờ gọi CopyObject (network call MinIO) trong transaction
    );
  }

  // Mã hoàn toàn mới (không khớp mẫu phiên bản, hoặc baseCode chưa từng thấy).
  return prisma.$transaction(
    async (tx) => {
      const product = await tx.product.create({
        data: {
          baseCode: candidateBaseCode,
          amisProductId: input.amisProductId,
          status: ProductStatus.PENDING_QC,
        },
      });
      const version = await tx.productVersion.create({
        data: {
          productId: product.id,
          // Nếu chính lần xuất hiện đầu tiên của gốc mã này đã có hậu tố `.N` thật (vd `.3` vì các
          // đơn hàng của phiên bản sớm hơn không nằm trong dữ liệu năm nay), ghi nhận đúng số đó
          // làm versionNumber sáng lập — không đánh số lại thành 1 một cách máy móc.
          versionNumber: parsed ? parsed.versionNumber : 1,
          amisProductId: input.amisProductId,
          name: input.name,
          description: input.description,
          isCurrent: true,
          createdByAmisSync: true,
        },
      });
      await tx.product.update({ where: { id: product.id }, data: { currentVersionId: version.id } });
      return { kind: "created" as const, productId: product.id };
    },
    { timeout: 10000 }
  );
}
