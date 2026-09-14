import { describe, expect, it, afterEach } from "vitest";
import { prisma, ProductStatus } from "@qc/db";
import { upsertProductFromAmis } from "./upsert-product";
import { buildStorageKey, getUploadUrl, getViewUrl, deleteObject, ensureBucketExists } from "@qc/storage";

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
    //
    // Lưu ý (sau Fix 1): founding version giờ dùng đúng hậu tố `.N` thật của
    // AMIS làm versionNumber thay vì 1 bộ đếm giả — nên ở đây founding bằng
    // mã `.1` (versionNumber=1) rồi phiên bản kế tiếp dùng `.2` (versionNumber=2),
    // thay vì founding bằng mã TRẦN (sẽ tự nhận versionNumber=1 y hệt, gây
    // đụng độ giả tạo với `.1` — xem Fix 1 report).
    const versionBaseCode = `ZZ${String(Date.now()).slice(-6)}`;

    await upsertProductFromAmis({
      amisProductId: baseAmisId,
      code: `${versionBaseCode}.1`,
      name: "Bản gốc (v1)",
      description: null,
    });
    const base = await prisma.product.findUnique({
      where: { baseCode: versionBaseCode },
      include: { currentVersion: true },
    });
    expect(base?.currentVersion?.versionNumber).toBe(1);
    // Giả lập Admin đã nhập nội dung QC vào phiên bản 1
    await prisma.qCData.create({
      data: { versionId: base!.currentVersion!.id, checklist: "Đã kiểm tra kích thước" },
    });

    const result = await upsertProductFromAmis({
      amisProductId: `${baseAmisId}-2`,
      code: `${versionBaseCode}.2`,
      name: "Bản gốc (v2)",
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
    //
    // Lưu ý (sau Fix 1): founding dùng mã `.1` (versionNumber=1 thật) thay vì
    // mã trần, để mã `.2` kế tiếp không đụng độ số phiên bản (xem Fix 1 report).
    const baseAmisId = `amis-${testBaseCode}-dup2-v1`;
    const versionBaseCode = `ZY${String(Date.now()).slice(-6)}`;

    // Lần 1: tạo baseCode gốc (version 1, mã `.1`).
    await upsertProductFromAmis({
      amisProductId: baseAmisId,
      code: `${versionBaseCode}.1`,
      name: "Bản gốc (v1)",
      description: null,
    });

    // Lần 2: mã version-suffixed (vd từ đơn hàng #1) — tạo ProductVersion số 2.
    const versionedAmisId = `${baseAmisId}-2`;
    const versionedCode = `${versionBaseCode}.2`;
    const firstResult = await upsertProductFromAmis({
      amisProductId: versionedAmisId,
      code: versionedCode,
      name: "Bản gốc (v2)",
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

  it("mã TRẦN (không hậu tố version) xuất hiện SAU khi mã có hậu tố của cùng gốc đã tạo Product không được tạo Product/ProductVersion trùng baseCode", async () => {
    // Tái hiện đúng lỗi thật gặp khi chạy sync với dữ liệu AMIS 2026 đầy đủ
    // (vd mã "AA09596"): dữ liệu đơn hàng AMIS chứa CẢ mã có hậu tố version
    // (vd "AA09596.1") LẪN mã trần của đúng gốc đó (vd "AA09596"), và mã có
    // hậu tố được xử lý TRƯỚC trong cùng lần sync — nó founding 1 Product
    // với baseCode = phần gốc ("AA09596"). Khi mã trần "AA09596" (không có
    // hậu tố, parsed = null) xuất hiện SAU, amisProductId của nó khác với
    // amisProductId đã đồng bộ (bug trước đã fix ở existingVersion check),
    // nên rơi tiếp xuống logic tìm existingBase — nhưng bug (bug thứ 2, đang
    // fix ở đây) chỉ tra existingBase khi `parsed` truthy, nên với mã trần
    // (parsed = null) nó luôn bị bỏ qua và code rơi thẳng vào nhánh "hoàn
    // toàn mới", cố gọi `prisma.product.create({ baseCode: "AA09596" })` —
    // đụng unique constraint Product.baseCode (Product đã tồn tại với đúng
    // baseCode này) và ném lỗi, làm sập cả lần sync.
    //
    // Fix: luôn tra existingBase bằng `parsed ? parsed.baseCode : input.code`
    // (không điều kiện theo parsed truthy nữa) — khi tìm thấy Product đã tồn
    // tại VÀ mã hiện tại là mã trần (parsed = null), coi như không có gì mới
    // để tạo, trả về linked_existing thay vì tạo Product/ProductVersion mới.
    const baseAmisId = `amis-${testBaseCode}-bare-v1`;
    const versionBaseCode = `ZX${String(Date.now()).slice(-6)}`;

    // Lần 1: mã có hậu tố version (vd "AA09596.1") xử lý trước — founding
    // Product với baseCode = phần gốc, tạo ProductVersion số 1.
    const versionedResult = await upsertProductFromAmis({
      amisProductId: baseAmisId,
      code: `${versionBaseCode}.1`,
      name: "Bản gốc (v1)",
      description: null,
    });
    expect(versionedResult.kind).toBe("created");

    const productCountBefore = await prisma.product.count({ where: { baseCode: versionBaseCode } });
    const versionCountBefore = await prisma.productVersion.count({ where: { productId: (await prisma.product.findUnique({ where: { baseCode: versionBaseCode } }))!.id } });
    expect(productCountBefore).toBe(1);
    expect(versionCountBefore).toBe(1);

    // Lần 2: mã TRẦN của đúng gốc đó (vd "AA09596"), amisProductId khác,
    // xuất hiện sau (đơn hàng khác) — phải được nhận diện là đã có Product
    // này rồi, KHÔNG được tạo thêm Product/ProductVersion, KHÔNG được ném lỗi.
    const bareAmisId = `${baseAmisId}-bare`;
    const bareResult = await upsertProductFromAmis({
      amisProductId: bareAmisId,
      code: versionBaseCode,
      name: "Bản gốc",
      description: null,
    });
    expect(bareResult.kind).toBe("linked_existing");

    const product = await prisma.product.findUnique({ where: { baseCode: versionBaseCode } });
    expect(product).not.toBeNull();
    const productCountAfter = await prisma.product.count({ where: { baseCode: versionBaseCode } });
    const versionCountAfter = await prisma.productVersion.count({ where: { productId: product!.id } });
    expect(productCountAfter).toBe(1);
    expect(versionCountAfter).toBe(1);
  });

  it("mã .2 được xử lý TRƯỚC (thành current, versionNumber=2), sau đó mã .1 mới xuất hiện — không được ghi đè currentVersion đang có (fix: dùng đúng hậu tố .N thật của AMIS làm versionNumber, không phải bộ đếm theo thứ tự sync)", async () => {
    const baseAmisId = `amis-${testBaseCode}-order-v2first`;
    const versionBaseCode = `ZW${String(Date.now()).slice(-6)}`;

    const firstResult = await upsertProductFromAmis({
      amisProductId: `${baseAmisId}-2`,
      code: `${versionBaseCode}.2`,
      name: "Bản .2",
      description: null,
    });
    expect(firstResult.kind).toBe("created");

    const afterFirst = await prisma.product.findUnique({
      where: { baseCode: versionBaseCode },
      include: { currentVersion: true },
    });
    expect(afterFirst?.currentVersion?.versionNumber).toBe(2);

    const secondResult = await upsertProductFromAmis({
      amisProductId: `${baseAmisId}-1`,
      code: `${versionBaseCode}.1`,
      name: "Bản .1 (xuất hiện sau nhưng là bản CŨ hơn)",
      description: null,
    });
    expect(secondResult.kind).toBe("new_version");

    const afterSecond = await prisma.product.findUnique({
      where: { baseCode: versionBaseCode },
      include: { currentVersion: true },
    });
    // currentVersion PHẢI vẫn là phiên bản .2 (versionNumber=2) — không bị mã .1 (cũ hơn) ghi đè.
    expect(afterSecond?.currentVersion?.versionNumber).toBe(2);

    const olderVersion = await prisma.productVersion.findFirst({
      where: { productId: afterSecond!.id, versionNumber: 1 },
    });
    // Vẫn tạo bản ghi ProductVersion số 1 (để xem trong Lịch sử phiên bản sau này), chỉ không phải currentVersion.
    expect(olderVersion).not.toBeNull();
    expect(olderVersion?.isCurrent).toBe(false);
  });

  it("mã .1 được xử lý trước, sau đó mã .5 xuất hiện — currentVersion chuyển sang .5 (chiều thuận, vẫn phải hoạt động đúng)", async () => {
    const baseAmisId = `amis-${testBaseCode}-order-v1first`;
    const versionBaseCode = `ZV${String(Date.now()).slice(-6)}`;

    await upsertProductFromAmis({
      amisProductId: `${baseAmisId}-1`,
      code: `${versionBaseCode}.1`,
      name: "Bản .1",
      description: null,
    });

    const result = await upsertProductFromAmis({
      amisProductId: `${baseAmisId}-5`,
      code: `${versionBaseCode}.5`,
      name: "Bản .5",
      description: null,
    });
    expect(result.kind).toBe("new_version");

    const product = await prisma.product.findUnique({
      where: { baseCode: versionBaseCode },
      include: { currentVersion: true },
    });
    expect(product?.currentVersion?.versionNumber).toBe(5);
  });

  it("mã hoàn toàn mới mà lần xuất hiện đầu tiên đã có hậu tố .3 — versionNumber sáng lập phải là 3, không bị đánh số lại thành 1", async () => {
    const baseAmisId = `amis-${testBaseCode}-firstseen-v3`;
    const versionBaseCode = `ZT${String(Date.now()).slice(-6)}`;

    const result = await upsertProductFromAmis({
      amisProductId: baseAmisId,
      code: `${versionBaseCode}.3`,
      name: "Bản .3 (lần đầu thấy trong dữ liệu năm nay)",
      description: null,
    });
    expect(result.kind).toBe("created");

    const product = await prisma.product.findUnique({
      where: { baseCode: versionBaseCode },
      include: { currentVersion: true },
    });
    expect(product?.currentVersion?.versionNumber).toBe(3);
    expect(product?.currentVersion?.isCurrent).toBe(true);
  });

  it("mã TRẦN founding versionNumber=1, rồi mã CÓ hậu tố .1 thật của cùng gốc xuất hiện sau — 2 cách viết của CÙNG 1 phiên bản, không được tạo dòng trùng hay ném lỗi unique constraint (phát hiện trên dữ liệu thật, vd baseCode SI07276)", async () => {
    const baseAmisId = `amis-${testBaseCode}-barefirst-v1`;
    const versionBaseCode = `ZS${String(Date.now()).slice(-6)}`;

    const bareResult = await upsertProductFromAmis({
      amisProductId: baseAmisId,
      code: versionBaseCode,
      name: "Bản gốc (mã trần)",
      description: null,
    });
    expect(bareResult.kind).toBe("created");

    const afterBare = await prisma.product.findUnique({
      where: { baseCode: versionBaseCode },
      include: { currentVersion: true },
    });
    expect(afterBare?.currentVersion?.versionNumber).toBe(1);

    const suffixedResult = await upsertProductFromAmis({
      amisProductId: `${baseAmisId}-suffixed`,
      code: `${versionBaseCode}.1`,
      name: "Bản gốc (mã .1)",
      description: null,
    });
    // Không có gì mới để ghi — cùng 1 khái niệm phiên bản 1, chỉ viết mã khác đi.
    expect(suffixedResult.kind).toBe("linked_existing");

    const afterSuffixed = await prisma.product.findUnique({
      where: { baseCode: versionBaseCode },
      include: { currentVersion: true },
    });
    expect(afterSuffixed?.currentVersion?.versionNumber).toBe(1);
    const versionCount = await prisma.productVersion.count({ where: { productId: afterSuffixed!.id } });
    expect(versionCount).toBe(1); // không tạo thêm dòng ProductVersion nào
  });

  it("kế thừa media sang phiên bản mới bằng file ĐỘC LẬP — xóa media ở bản mới không ảnh hưởng bản cũ", async () => {
    await ensureBucketExists();
    // Lưu ý (khác brief gốc): parseVersionSuffix chỉ khớp baseCode có TỐI ĐA 4 chữ cái ở đầu (regex
    // `^([A-Z]{1,4}\d{4,7})\.(\d{1,2})$`, xem version-detection.ts — cùng ràng buộc đã ghi chú ở test
    // "TESTUP..." phía trên). "MEDCLONE" có 8 chữ cái nên `${baseCode}.2` sẽ KHÔNG BAO GIỜ được nhận
    // diện là version-suffix của baseCode này — upsertProductFromAmis sẽ tạo 1 Product HOÀN TOÀN MỚI,
    // không liên quan gì đến v1, và cloneVersionContent không bao giờ được gọi (test sẽ không kiểm tra
    // đúng đường code cần kiểm tra). Dùng "MC" (2 chữ cái) + 6 chữ số cuối timestamp để khớp regex.
    const baseCode = `MC${String(Date.now()).slice(-6)}`;
    const product = await prisma.product.create({ data: { baseCode, amisProductId: `amis-${baseCode}`, status: "PENDING_QC" } });
    const v1 = await prisma.productVersion.create({
      data: { productId: product.id, versionNumber: 1, amisProductId: `amis-v1-${baseCode}`, name: "Bản 1", isCurrent: true },
    });
    await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: v1.id } });

    const tcsp = await prisma.tCSPData.create({ data: { versionId: v1.id, description: "Mô tả gốc" } });
    const originalKey = buildStorageKey(baseCode, v1.id, "anh-goc.jpg");
    const content = Buffer.from("noi dung anh goc");
    const uploadUrl = await getUploadUrl({ storageKey: originalKey, mimeType: "image/jpeg", size: content.length });
    await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg", "Content-Length": String(content.length) }, body: content });
    await prisma.mediaAsset.create({ data: { storageKey: originalKey, mimeType: "image/jpeg", sortOrder: 0, tcspId: tcsp.id } });

    // Kích hoạt tạo phiên bản mới (.2) kế thừa nội dung + media từ v1.
    await upsertProductFromAmis({ amisProductId: `amis-v2-${baseCode}`, code: `${baseCode}.2`, name: "Bản 2", description: null });

    const v2 = await prisma.productVersion.findUnique({ where: { amisProductId: `amis-v2-${baseCode}` }, include: { tcsp: { include: { media: true } } } });
    expect(v2?.tcsp?.media).toHaveLength(1);
    const newKey = v2!.tcsp!.media[0].storageKey;
    expect(newKey).not.toBe(originalKey); // file ĐỘC LẬP, không dùng chung storageKey

    // Xác nhận bản sao ở MinIO là 1 object THẬT, ĐỘC LẬP, giống hệt byte-for-byte với bản gốc — không
    // chỉ storageKey khác đi (khác key không tự nó chứng minh CopyObject thực sự chạy; nếu copyObject
    // bị vô hiệu hoá/không được gọi, newKey vẫn khác originalKey nhờ buildStorageKey random UUID, nhưng
    // sẽ không có file thật nào ở newKey).
    const newFileRes = await fetch(await getViewUrl(newKey));
    expect(newFileRes.ok).toBe(true);
    expect(Buffer.from(await newFileRes.arrayBuffer()).equals(content)).toBe(true);

    // Xóa media của bản MỚI (giả lập người dùng xóa ảnh ở phiên bản hiện hành) — bản GỐC (v1, chỉ đọc)
    // phải còn nguyên VÀ NỘI DUNG KHÔNG ĐỔI. Đây chính là kịch bản xung đột spec §7 mô tả (kế thừa +
    // xóa hẳn file) — chỉ kiểm tra `.ok` là chưa đủ (xóa 1 key CHƯA TỪNG được tạo cũng là no-op, "còn
    // đó" 1 cách vô nghĩa), nên phải so khớp bytes để chứng minh đúng là file gốc còn nguyên vẹn.
    await deleteObject(newKey);
    const originalStillThere = await fetch(await getViewUrl(originalKey));
    expect(originalStillThere.ok).toBe(true);
    expect(Buffer.from(await originalStillThere.arrayBuffer()).equals(content)).toBe(true);

    await deleteObject(originalKey);
    // Dùng lại cleanupTestProduct (đã xoá đúng thứ tự TCSPData/MediaAsset trước ProductVersion)
    // thay vì productVersion.deleteMany trực tiếp — TCSPData.versionId là FK ON DELETE RESTRICT
    // (xem migration.sql), nên bản v1 VÀ bản v2 kế thừa (đều có TCSPData) sẽ chặn deleteMany nếu
    // không xoá TCSPData trước.
    await cleanupTestProduct(product.id);
  });

  it("tên trôi lớn so với phiên bản hiện hành — ProductVersion mới bị gắn cờ needsInheritanceReview + ghi ChangeLogEntry nameDrift", async () => {
    const baseAmisId = `amis-${testBaseCode}-drift-v1`;
    const versionBaseCode = `ZR${String(Date.now()).slice(-6)}`;

    await upsertProductFromAmis({
      amisProductId: baseAmisId,
      code: `${versionBaseCode}.1`,
      name: "Nhãn lọ Avinora bọt tắm gội cho bé",
      description: null,
    });

    const result = await upsertProductFromAmis({
      amisProductId: `${baseAmisId}-2`,
      code: `${versionBaseCode}.2`,
      name: "Tem giấy cán bóng Nước muối Sao Mai 500ml",
      description: null,
    });
    expect(result.kind).toBe("new_version");

    const product = await prisma.product.findUnique({
      where: { baseCode: versionBaseCode },
      include: { currentVersion: { include: { changeLogs: true } } },
    });
    expect(product?.currentVersion?.versionNumber).toBe(2);
    expect(product?.currentVersion?.needsInheritanceReview).toBe(true);
    const driftLog = product?.currentVersion?.changeLogs.find((l) => l.fieldPath === "nameDrift");
    expect(driftLog?.oldValue).toBe("Nhãn lọ Avinora bọt tắm gội cho bé");
    expect(driftLog?.newValue).toBe("Tem giấy cán bóng Nước muối Sao Mai 500ml");
    expect(driftLog?.source).toBe("AMIS_SYNC");
  });

  it("tên KHÔNG trôi (chỉ đổi lô) — ProductVersion mới KHÔNG bị gắn cờ, không có ChangeLogEntry nameDrift", async () => {
    const baseAmisId = `amis-${testBaseCode}-nodrift-v1`;
    const versionBaseCode = `ZQ${String(Date.now()).slice(-6)}`;

    await upsertProductFromAmis({
      amisProductId: baseAmisId,
      code: `${versionBaseCode}.1`,
      name: "Nhãn ống nghiệm lấy máu Clot Activator 2ml lô 1",
      description: null,
    });

    await upsertProductFromAmis({
      amisProductId: `${baseAmisId}-2`,
      code: `${versionBaseCode}.2`,
      name: "Tem ống nghiệm lấy máu Clot Activator 2ml lô 2",
      description: null,
    });

    const product = await prisma.product.findUnique({
      where: { baseCode: versionBaseCode },
      include: { currentVersion: { include: { changeLogs: true } } },
    });
    expect(product?.currentVersion?.needsInheritanceReview).toBe(false);
    expect(product?.currentVersion?.changeLogs.some((l) => l.fieldPath === "nameDrift")).toBe(false);
  });
});
