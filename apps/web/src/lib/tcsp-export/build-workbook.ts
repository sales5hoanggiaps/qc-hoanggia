import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";

// process.cwd() khác nhau giữa dev/test (workspace "apps/web", cwd = apps/web/) và container
// production (docker-entrypoint.sh chạy `node apps/web/server.js` từ WORKDIR /repo, cwd = /repo) —
// dò cả 2 ứng viên thay vì giả định 1 cwd cố định (xem ghi chú pre-flight đầu Task 6).
function resolveTemplatePath(): string {
  const candidates = [
    path.resolve(process.cwd(), "assets/templates/tcsp-template.xlsx"), // cwd = /repo (production)
    path.resolve(process.cwd(), "../../assets/templates/tcsp-template.xlsx"), // cwd = apps/web (dev/test)
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(`Không tìm thấy file mẫu TCSP. Đã thử: ${candidates.join(", ")}`);
  }
  return found;
}

const TEMPLATE_PATH = resolveTemplatePath();
const FIRST_DATA_ROW = 8;
// Mẫu sạch (assets/templates/tcsp-template.xlsx) có sẵn 9 dòng dữ liệu ví dụ (8-16, xác nhận bằng
// cách mở lại file mẫu thật: merge A8:A10 + A11:A16 = 9 dòng), 1 dòng trống (17), rồi chân trang
// (18). Số dòng thông số thật của sản phẩm hiếm khi đúng bằng 9 — phải co giãn khối 9 dòng này cho
// khớp SỐ THẬT trước khi ghi dữ liệu, không chỉ chèn thêm khi > 9 (xem ghi chú dưới).
const ORIGINAL_EXAMPLE_ROW_COUNT = 9;

export interface TcspExportSpecRow {
  groupName: string;
  criterion: string;
  value: string;
  tolerance: string | null;
  unit: string | null;
  note: string | null;
}

export interface TcspExportInput {
  baseCode: string;
  versionNumber: number;
  name: string;
  materialCode: string | null;
  description: string | null;
  preparedBy: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  specRows: TcspExportSpecRow[];
  imageBuffer: Buffer | null; // ảnh đầu tiên (sortOrder nhỏ nhất) của tab TCSP, nếu có
  // Định dạng thật của `imageBuffer` — exceljs chỉ hỗ trợ 3 giá trị này và dùng đúng chuỗi này để ghi
  // Content-Type thật trong [Content_Types].xml của file .xlsx (xem content-types-xform.js), không
  // chỉ là tên file — nhãn sai định dạng (vd bytes PNG nhưng khai "jpeg") có thể khiến Excel không
  // đọc được ảnh. Optional + mặc định "jpeg" bên dưới để không phá test/behaviour cũ của Task 6.
  imageExtension?: "jpeg" | "png" | "gif";
}

export async function buildTcspWorkbook(input: TcspExportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);
  const sheet = wb.getWorksheet("TCSP")!;

  sheet.getCell("B3").value = `${input.baseCode}.${input.versionNumber}`;
  sheet.getCell("D3").value = input.name;
  sheet.getCell("B5").value = input.description ?? "";
  sheet.getCell("B6").value = input.materialCode ?? "";

  if (input.imageBuffer) {
    // 2 ép kiểu `any` dưới đây xử lý 2 vấn đề riêng, cả 2 đều chỉ là lệch KIỂU KHAI BÁO (.d.ts),
    // không phải lỗi runtime — đã tự kiểm chứng bằng file test-output thật, ảnh lên đúng vị trí:
    // 1) `Buffer` project này dùng (@types/node 20.19.43 + TypeScript 5.9) là kiểu Buffer tham số hóa
    //    mới, còn `exceljs/index.d.ts` lại tham chiếu 1 kiểu `Buffer` KHÁC — cũ hơn, đến từ
    //    `@fast-csv/format`/`@fast-csv/parse` (phụ thuộc bắc cầu của exceljs, tự mang kèm
    //    `@types/node@14.18.63` riêng) — 2 kiểu cùng tên "Buffer" nhưng không tương thích cấu trúc.
    // 2) `sheet.addImage`'s kiểu `tl`/`br` đòi đúng class `Anchor` (có field private colWidth/
    //    rowHeight/worksheet) chứ không phải interface `IAnchor` — không thể dựng 1 object literal
    //    thỏa mãn được; runtime thực tế chỉ cần đúng `col`/`row`.
    const imageId = wb.addImage({ buffer: input.imageBuffer as any, extension: input.imageExtension ?? "jpeg" });
    sheet.addImage(imageId, {
      tl: { col: 1, row: 3 },
      br: { col: 6, row: 4 },
      editAs: "oneCell",
    } as any);
  }

  const rowCount = input.specRows.length;
  // Lệch so với brief: code gốc trong brief chỉ xử lý trường hợp NHIỀU HƠN 9 dòng (duplicateRow khi
  // rowCount > 1) — không hề xóa bớt 9 dòng mẫu có sẵn khi rowCount THẬT sự < 9. Nếu chỉ ghi đè giá
  // trị lên 9 dòng có sẵn mà không xóa bớt, dòng trống + chân trang vẫn nằm nguyên ở vị trí cũ (dòng
  // 17/18) thay vì trượt lên — test "footer dịch đúng theo số dòng thông số" (3 dòng → chân trang
  // dòng 12) sẽ FAIL với code gốc của brief. Phát hiện khi chạy thật (TDD tự lộ ra, đúng như brief
  // đã lường trước ở cuối Bước 4) — sửa thành so sánh với ORIGINAL_EXAMPLE_ROW_COUNT rồi chèn thêm
  // (delta > 0) hoặc xóa bớt (delta < 0), luôn giữ tối thiểu 1 dòng vật lý (khớp footerRow dùng
  // Math.max(rowCount, 1) — 0 dòng thông số vẫn cần 1 dòng "trống" giữ chỗ trước khi tới dòng trống
  // thật + chân trang).
  const effectiveRowCount = Math.max(rowCount, 1);
  const delta = effectiveRowCount - ORIGINAL_EXAMPLE_ROW_COUNT;

  // Template có sẵn 2 loại merge trên khối 9 dòng ví dụ gốc (8-16): merge dọc cột A theo nhóm
  // (A8:A10, A11:A16) và merge B:C riêng từng dòng (B8:C8 … B16:C16, cột "Tiêu chí"). Phải tháo HẾT
  // 2 loại này TRƯỚC khi gọi spliceRows/duplicateRow, không phải sau — phát hiện thực nghiệm (mở file
  // test-output thật, không phải đoán): cả `spliceRows` lẫn `duplicateRow` đều không cập nhật/nhân
  // bản đúng bảng merge nội bộ của exceljs theo dòng đã xóa/chèn:
  //  - spliceRows: merge cũ (vd "A11:A16") vẫn tồn tại y nguyên dù các dòng đó đã bị xóa hẳn, chỉ nội
  //    dung ô dịch lên trên — hậu quả: ô cột A ở dòng chân trang mới (vd A12 khi co còn 3 dòng) bị
  //    merge cũ "nuốt" thành ô phụ thuộc (merge slave) của 1 master trống, che mất giá trị thật
  //    "Người lập: " dù dữ liệu vẫn nằm đúng vị trí vật lý.
  //  - duplicateRow: các dòng MỚI chèn thêm (khi > 9 dòng thông số) không được tự động gán merge B:C
  //    như dòng nguồn — cột "Tiêu chí" của các dòng mới bị thiếu merge (B đứng riêng, C trống) — dù
  //    bảng merge nội bộ (`sheet.model.merges`) lại báo merge "B9:C9" v.v. đã tồn tại từ trước (thật
  //    ra là entry cũ của dòng ví dụ gốc, không tương ứng ô mới) → gọi lại `mergeCells` cho đúng ô đó
  //    báo lỗi "Cannot merge already merged cells" dù ô thực tế chưa hề được merge đúng nghĩa.
  // Cách xử lý an toàn nhất: tháo TOÀN BỘ merge (cả cột A lẫn B:C) trên khối 9 dòng gốc TRƯỚC khi co
  // giãn, rồi tự dựng lại merge cho ĐÚNG SỐ DÒNG THẬT sau khi co giãn xong — không dựa vào bất kỳ
  // merge nào của template sống sót qua bước co giãn.
  const templateLastRow = FIRST_DATA_ROW + ORIGINAL_EXAMPLE_ROW_COUNT - 1;
  sheet.unMergeCells(`A${FIRST_DATA_ROW}:A${templateLastRow}`);
  sheet.unMergeCells(`B${FIRST_DATA_ROW}:C${templateLastRow}`);

  if (delta > 0) {
    // Dòng 8 (FIRST_DATA_ROW) đã có sẵn style trong template — nhân bản style đó cho các dòng dữ
    // liệu còn lại, chèn ngay sau dòng 8 (đẩy dòng trống + chân trang xuống theo).
    sheet.duplicateRow(FIRST_DATA_ROW, delta, true);
  } else if (delta < 0) {
    // Xóa bớt các dòng mẫu thừa ngay sau khối dữ liệu thật sẽ giữ lại, kéo dòng trống + chân trang
    // trượt lên đúng vị trí.
    sheet.spliceRows(FIRST_DATA_ROW + effectiveRowCount, -delta);
  }

  // Dựng lại merge B:C cho ĐÚNG số dòng dữ liệu thật sau khi co giãn (không phụ thuộc merge cũ nào
  // của template sống sót — đã tháo sạch ở trên).
  for (let i = 0; i < effectiveRowCount; i++) {
    sheet.mergeCells(`B${FIRST_DATA_ROW + i}:C${FIRST_DATA_ROW + i}`);
  }

  let currentGroup: string | null = null;
  let groupStartRow = FIRST_DATA_ROW;
  input.specRows.forEach((row, i) => {
    const r = FIRST_DATA_ROW + i;
    sheet.getCell(`B${r}`).value = row.criterion;
    sheet.getCell(`D${r}`).value = row.value;
    sheet.getCell(`E${r}`).value = row.tolerance ?? "";
    sheet.getCell(`F${r}`).value = row.unit ?? "";
    sheet.getCell(`G${r}`).value = row.note ?? "";

    if (row.groupName !== currentGroup) {
      if (currentGroup !== null && r - 1 >= groupStartRow) {
        sheet.mergeCells(`A${groupStartRow}:A${r - 1}`);
      }
      currentGroup = row.groupName;
      groupStartRow = r;
      sheet.getCell(`A${r}`).value = row.groupName;
    }
  });
  if (currentGroup !== null) {
    const lastRow = FIRST_DATA_ROW + rowCount - 1;
    if (lastRow >= groupStartRow) sheet.mergeCells(`A${groupStartRow}:A${lastRow}`);
  }

  // Chân trang cách 1 dòng trống sau dòng dữ liệu cuối cùng (khớp layout gốc: dòng 16 dữ liệu cuối,
  // dòng 17 trống, dòng 18 chân trang — offset +2 tính từ dòng dữ liệu cuối). Xác nhận thực nghiệm
  // bằng cách mở lại file mẫu sạch (assets/templates/tcsp-template.xlsx) và file test-output thật:
  // nhãn "Ngày duyệt" nằm ở G18, giá trị đúng là H18 (không lệch cột so với suy luận của brief).
  const footerRow = FIRST_DATA_ROW + Math.max(rowCount, 1) - 1 + 2;
  sheet.getCell(`B${footerRow}`).value = input.preparedBy ?? "";
  sheet.getCell(`E${footerRow}`).value = input.approvedBy ?? "";
  sheet.getCell(`H${footerRow}`).value = input.approvedAt ? input.approvedAt.toLocaleDateString("vi-VN") : "";

  // `wb.xlsx.writeBuffer()` khai báo trả `Promise<Buffer>` nhưng là kiểu "Buffer" KHÁC (xem giải
  // thích ở khối addImage phía trên — lệch @types/node giữa exceljs và project này qua @fast-csv) —
  // ép kiểu qua `unknown` để khớp lại đúng kiểu `Buffer` của project. Runtime không đổi: vẫn đúng 1
  // Buffer thật (đọc thẳng exceljs/lib/xlsx/xlsx.js: `stream.read()` từ StreamBuf).
  const buffer = await wb.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}
