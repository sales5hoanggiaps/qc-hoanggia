import { describe, expect, it, afterEach } from "vitest";
import { prisma, ProductStatus } from "@qc/db";
import { upsertProductFromAmis } from "./upsert-product";

const testBaseCode = `TESTUP${Date.now()}`;

/**
 * Xoá sạch 1 Product test cùng toàn bộ dữ liệu con của MỌI ProductVersion
 * của nó (TCSPData/QCData/PackagingData/DocumentsData + các bảng con lồng
 * bên trong + MediaAsset), theo đúng thứ tự để không vi phạm FK
 * (TCSPData/QCData/PackagingData/DocumentsData -> ProductVersion là
 * ON DELETE RESTRICT trong migration, nên phải xoá các bảng nội dung
 * trước khi xoá ProductVersion — nếu không afterEach sẽ ném lỗi FK và để
 * lại rác trong DB thay vì dọn sạch).
 */
async function cleanupTestProduct(productId: string) {
  const versions = await prisma.productVersion.findMany({ where: { productId } });
  for (const v of versions) {
    const [tcsp, qc, packaging, documents] = await Promise.all([
      prisma.tCSPData.findUnique({ where: { versionId: v.id } }),
      prisma.qCData.findUnique({ where: { versionId: v.id } }),
      prisma.packagingData.findUnique({ where: { versionId: v.id } }),
      prisma.documentsData.findUnique({ where: { versionId: v.id } }),
    ]);
    if (tcsp) {
      await prisma.mediaAsset.deleteMany({ where: { tcspId: tcsp.id } });
      await prisma.tCSPSpecRow.deleteMany({ where: { tcspId: tcsp.id } });
      await prisma.tCSPData.delete({ where: { id: tcsp.id } });
    }
    if (qc) {
      await prisma.mediaAsset.deleteMany({ where: { qcId: qc.id } });
      await prisma.qCData.delete({ where: { id: qc.id } });
    }
    if (packaging) {
      await prisma.mediaAsset.deleteMany({ where: { packagingId: packaging.id } });
      await prisma.packagingData.delete({ where: { id: packaging.id } });
    }
    if (documents) {
      await prisma.productDocument.deleteMany({ where: { documentsId: documents.id } });
      await prisma.documentsData.delete({ where: { id: documents.id } });
    }
  }
  await prisma.changeLogEntry.deleteMany({ where: { version: { productId } } });
  await prisma.productVersion.deleteMany({ where: { productId } });
  await prisma.product.delete({ where: { id: productId } });
}

describe("upsertProductFromAmis", () => {
  afterEach(async () => {
    // Mọi amisProductId được tạo trong file test này đều bắt đầu bằng
    // `amis-${testBaseCode}` (xem từng test bên dưới) — dùng tiền tố này
    // (thay vì Product.baseCode) để tìm các Product cần dọn, vì test thứ 3
    // cố tình dùng 1 baseCode KHÔNG bắt đầu bằng "TESTUP" (giải thích ở
    // test đó) nên không thể lọc theo baseCode startsWith "TESTUP" được nữa.
    const products = await prisma.product.findMany({
      where: { amisProductId: { startsWith: `amis-${testBaseCode}` } },
    });
    for (const p of products) {
      await cleanupTestProduct(p.id);
    }
  });

  it("tạo Product + ProductVersion số 1 khi mã hoàn toàn mới", async () => {
    const result = await upsertProductFromAmis({
      amisProductId: `amis-${testBaseCode}`,
      code: testBaseCode,
      name: "Sản phẩm test",
      description: "Mô tả test",
    });
    expect(result.kind).toBe("created");

    const product = await prisma.product.findUnique({
      where: { baseCode: testBaseCode },
      include: { currentVersion: true },
    });
    expect(product?.status).toBe(ProductStatus.PENDING_QC);
    expect(product?.currentVersion?.versionNumber).toBe(1);
    expect(product?.currentVersion?.isCurrent).toBe(true);
  });

  it("gọi lại với cùng amisProductId không tạo bản ghi trùng", async () => {
    const amisProductId = `amis-${testBaseCode}-dup`;
    await upsertProductFromAmis({ amisProductId, code: `${testBaseCode}DUP`, name: "A", description: null });
    const result2 = await upsertProductFromAmis({ amisProductId, code: `${testBaseCode}DUP`, name: "A", description: null });
    expect(result2.kind).toBe("linked_existing");

    const count = await prisma.product.count({ where: { amisProductId } });
    expect(count).toBe(1);
  });

  it("tạo phiên bản mới kế thừa nội dung khi mã có dạng <baseCode>.<n> và baseCode đã tồn tại", async () => {
    const baseAmisId = `amis-${testBaseCode}-v1`;
    // Ghi chú: parseVersionSuffix (Task 2) chỉ khớp baseCode có TỐI ĐA 4 chữ
    // cái ở đầu (regex `^([A-Z]{1,4}\d{4,7})\.(\d{1,2})$`, xác nhận với mã
    // AMIS thật). Tiền tố "TESTUP" của testBaseCode có 6 chữ cái nên KHÔNG
    // BAO GIỜ khớp được — dùng "TESTUP..." làm baseCode ở đây sẽ khiến
    // parseVersionSuffix luôn trả về null và test không bao giờ đi vào
    // nhánh "new_version" được. Vì vậy base code riêng cho test này phải
    // là chuỗi hợp lệ với regex (<=4 chữ cái + 4-7 chữ số); việc dọn dẹp
    // vẫn được đảm bảo vì amisProductId (không bị ràng buộc bởi regex) vẫn
    // bắt đầu bằng `amis-${testBaseCode}` như afterEach ở trên mong đợi.
    const versionBaseCode = `ZZ${String(Date.now()).slice(-6)}`;

    await upsertProductFromAmis({
      amisProductId: baseAmisId,
      code: versionBaseCode,
      name: "Bản gốc",
      description: null,
    });
    const base = await prisma.product.findUnique({
      where: { baseCode: versionBaseCode },
      include: { currentVersion: true },
    });
    // Giả lập Admin đã nhập nội dung QC vào phiên bản 1
    await prisma.qCData.create({
      data: { versionId: base!.currentVersion!.id, checklist: "Đã kiểm tra kích thước" },
    });

    const result = await upsertProductFromAmis({
      amisProductId: `${baseAmisId}-2`,
      code: `${versionBaseCode}.1`,
      name: "Bản gốc (v1)",
      description: null,
    });
    expect(result.kind).toBe("new_version");

    const updated = await prisma.product.findUnique({
      where: { baseCode: versionBaseCode },
      include: { currentVersion: { include: { qc: true } } },
    });
    expect(updated?.currentVersion?.versionNumber).toBe(2);
    expect(updated?.currentVersion?.qc?.checklist).toBe("Đã kiểm tra kích thước"); // kế thừa, không mất

    // Bản cũ (v1) vẫn còn nguyên, đọc được, không bị xoá — chỉ không còn
    // là currentVersion nữa.
    const oldVersion = await prisma.productVersion.findUnique({
      where: { id: base!.currentVersion!.id },
      include: { qc: true },
    });
    expect(oldVersion).not.toBeNull();
    expect(oldVersion?.isCurrent).toBe(false);
    expect(oldVersion?.qc?.checklist).toBe("Đã kiểm tra kích thước");
  });

  it("mã có version suffix xuất hiện LẦN THỨ HAI trong cùng lần sync (2 đơn hàng khác nhau, cùng amisProductId) không được tạo thêm ProductVersion trùng", async () => {
    // Tái hiện đúng lỗi thật gặp khi chạy sync với dữ liệu AMIS 2026 đầy đủ:
    // Product.amisProductId chỉ được set 1 LẦN DUY NHẤT lúc tạo Product (giữ
    // nguyên mã của phiên bản đầu tiên, vd "code:ZZ..."), và không bao giờ
    // được cập nhật khi tạo ProductVersion mới với amisProductId RIÊNG của nó
    // (vd "code:ZZ....1"). Vì vậy khi kiểm tra tồn tại bằng
    // `prisma.product.findUnique({ where: { amisProductId } })` (bug cũ), mã
    // "code:ZZ....1" KHÔNG BAO GIỜ khớp được với Product.amisProductId nào
    // (vì đó luôn là mã của phiên bản đầu) — nên nếu đúng mã version-suffixed
    // này xuất hiện LẦN THỨ HAI trong cùng 1 lần chạy sync (2 đơn hàng khác
    // nhau cùng chứa 1 mã hàng, hoàn toàn bình thường), code cũ sẽ rơi vào
    // nhánh "new_version" lần nữa và cố tạo thêm 1 ProductVersion khác với
    // CÙNG amisProductId đã tồn tại → vi phạm unique constraint
    // (ProductVersion_amisProductId_key) và ném lỗi, làm sập cả lần sync.
    //
    // Fix: kiểm tra tồn tại bằng ProductVersion.amisProductId (được set trên
    // MỌI version, không riêng version đầu) thay vì Product.amisProductId.
    const baseAmisId = `amis-${testBaseCode}-dup2-v1`;
    const versionBaseCode = `ZY${String(Date.now()).slice(-6)}`;

    // Lần 1: tạo baseCode gốc (version 1).
    await upsertProductFromAmis({
      amisProductId: baseAmisId,
      code: versionBaseCode,
      name: "Bản gốc",
      description: null,
    });

    // Lần 2: mã version-suffixed (vd từ đơn hàng #1) — tạo ProductVersion số 2.
    const versionedAmisId = `${baseAmisId}-2`;
    const versionedCode = `${versionBaseCode}.1`;
    const firstResult = await upsertProductFromAmis({
      amisProductId: versionedAmisId,
      code: versionedCode,
      name: "Bản gốc (v1)",
      description: null,
    });
    expect(firstResult.kind).toBe("new_version");

    // Lần 3: CÙNG amisProductId + CÙNG code version-suffixed xuất hiện lại
    // (vd từ đơn hàng #2 khác, trong cùng lần chạy sync) — phải nhận diện là
    // đã tồn tại, KHÔNG được tạo thêm ProductVersion và KHÔNG được ném lỗi.
    const secondResult = await upsertProductFromAmis({
      amisProductId: versionedAmisId,
      code: versionedCode,
      name: "Bản gốc (v1)",
      description: null,
    });
    expect(secondResult.kind).toBe("linked_existing");

    const versionCount = await prisma.productVersion.count({ where: { amisProductId: versionedAmisId } });
    expect(versionCount).toBe(1);
  });
});
