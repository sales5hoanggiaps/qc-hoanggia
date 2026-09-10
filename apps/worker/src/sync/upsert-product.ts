import { prisma, ProductStatus, type PrismaTransactionClient } from "@qc/db";
import { parseVersionSuffix } from "./version-detection";

export interface UpsertProductInput {
  amisProductId: string;
  code: string;
  name: string;
  description: string | null;
}

export type UpsertResult = { kind: "created" | "new_version" | "linked_existing"; productId: string };

/** Sao chép nội dung 4 mục từ 1 ProductVersion sang 1 ProductVersion mới (cùng dữ liệu, khoá ngoại mới).
 * Nhận `tx` (Prisma transaction client) thay vì dùng `prisma` toàn cục, để toàn bộ việc đọc/ghi bên
 * trong hàm này atomic cùng với phần còn lại của giao dịch gọi nó (xem upsertProductFromAmis). */
async function cloneVersionContent(tx: PrismaTransactionClient, fromVersionId: string, toVersionId: string) {
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
      await tx.mediaAsset.create({
        data: { storageKey: media.storageKey, mimeType: media.mimeType, caption: media.caption, sortOrder: media.sortOrder, tcspId: newTcsp.id },
      });
    }
  }

  if (qc) {
    const newQc = await tx.qCData.create({
      data: { versionId: toVersionId, checklist: qc.checklist, knownDefects: qc.knownDefects, specialNotes: qc.specialNotes },
    });
    for (const media of qc.media) {
      await tx.mediaAsset.create({
        data: { storageKey: media.storageKey, mimeType: media.mimeType, caption: media.caption, sortOrder: media.sortOrder, qcId: newQc.id },
      });
    }
  }

  if (packaging) {
    const newPackaging = await tx.packagingData.create({
      data: { versionId: toVersionId, instructions: packaging.instructions, specialNotes: packaging.specialNotes },
    });
    for (const media of packaging.media) {
      await tx.mediaAsset.create({
        data: { storageKey: media.storageKey, mimeType: media.mimeType, caption: media.caption, sortOrder: media.sortOrder, packagingId: newPackaging.id },
      });
    }
  }

  if (documents) {
    const newDocuments = await tx.documentsData.create({ data: { versionId: toVersionId } });
    for (const file of documents.files) {
      await tx.productDocument.create({
        data: { documentsId: newDocuments.id, kind: file.kind, label: file.label, storageKey: file.storageKey },
      });
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
          return { kind: "linked_existing" as const, productId: existingBase.id };
        }

        // Chỉ khi số phiên bản mới LỚN HƠN số hiện tại thì đây mới thật sự
        // là bản mới hơn — nếu nhỏ hơn, đây là 1 mã AMIS cũ hơn vừa được
        // phát hiện; vẫn ghi nhận lại (tab Lịch sử phiên bản sau này cần
        // thấy nó) nhưng không được ghi đè currentVersion đang có.
        const becomesNewCurrent = parsed.versionNumber > currentVersion.versionNumber;

        const newVersion = await tx.productVersion.create({
          data: {
            productId: existingBase.id,
            versionNumber: parsed.versionNumber,
            amisProductId: input.amisProductId,
            name: input.name,
            description: input.description,
            isCurrent: becomesNewCurrent,
            createdByAmisSync: true,
          },
        });
        // Luôn kế thừa nội dung từ phiên bản ĐANG là currentVersion (nội dung tốt nhất hiện có),
        // dù bản mới này có trở thành current hay không — 1 phiên bản cũ mới phát hiện vẫn nên
        // có sẵn 1 baseline nội dung thay vì trống trơn.
        await cloneVersionContent(tx, currentVersion.id, newVersion.id);

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
      { timeout: 10000 }
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
