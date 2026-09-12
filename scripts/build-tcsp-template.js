// Chạy 1 LẦN để tạo assets/templates/tcsp-template.xlsx từ file gốc thật của công ty.
// Cách chạy: node scripts/build-tcsp-template.js "C:\Users\Administrator\Downloads\TCSP HOÀNG GIA.xlsx"
const ExcelJS = require("exceljs");
const path = require("path");

async function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) {
    console.error("Cách dùng: node scripts/build-tcsp-template.js <đường dẫn file TCSP HOÀNG GIA.xlsx gốc>");
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(sourcePath);

  // Chỉ giữ lại sheet "TCSP Hàng mã SI" (cấu trúc giống hệt 2 sheet còn lại + sheet ẩn — xác nhận
  // 2026-09-11) — xóa các sheet khác, đổi tên sheet còn lại thành "TCSP" (dùng chung mọi mã hàng).
  const keep = wb.getWorksheet("TCSP Hàng mã SI");
  for (const sheet of [...wb.worksheets]) {
    if (sheet !== keep) wb.removeWorksheet(sheet.id);
  }
  keep.name = "TCSP";

  // Xóa dữ liệu ví dụ thật của khách hàng (SI06526), GIỮ NGUYÊN style/border/merge.
  keep.getCell("B3").value = null;
  keep.getCell("D3").value = null;
  keep.getCell("B5").value = null;
  keep.getCell("B6").value = null;
  for (let row = 8; row <= 16; row++) {
    for (const col of ["A", "B", "D", "E", "F", "G"]) {
      keep.getCell(`${col}${row}`).value = null;
    }
  }

  // Xóa ảnh thật của khách hàng đã nhúng sẵn (giữ lại vùng neo A4:G4 trống để build-workbook.ts
  // chèn ảnh thật của sản phẩm vào đúng vị trí này khi xuất).
  //
  // Lệch so với brief (2 chỗ, cả 2 phát hiện khi chạy thật):
  // 1) `keep.model.media = []` KHÔNG xóa được gì — `Worksheet.model` là 1 getter tính lại từ
  //    `this._media` mỗi lần đọc (xem exceljs/lib/doc/worksheet.js), gán vào object trả về của
  //    getter chỉ là no-op → để lại media "mồ côi" trỏ tới ảnh đã bị wb.media.splice xóa → ghi file
  //    lỗi (`Cannot read properties of undefined (reading 'name')` trong worksheet-xform.js khi nó
  //    tra `options.media[medium.imageId]` ra undefined). Xóa đúng chỗ chứa thật (`keep._media`).
  // 2) Sau khi xóa 3 sheet kia (AA, SB, Specification ẩn), ảnh nhúng trong CHÍNH các sheet đó vẫn
  //    còn nằm trong `wb.media` (workbook-level, không tự dọn theo `removeWorksheet`) — không sheet
  //    nào còn tham chiếu tới nữa nhưng vẫn là dữ liệu nhị phân "mồ côi" nằm lại trong file, không
  //    thật sự sạch. Dọn luôn toàn bộ `wb.media` (không chỉ ảnh của sheet SI) vì template cuối chỉ
  //    còn 1 sheet và nó không còn ảnh nào — không có lý do giữ ảnh của các sheet đã xóa.
  keep._media = [];
  wb.media = [];

  const outPath = path.resolve(__dirname, "../assets/templates/tcsp-template.xlsx");
  await wb.xlsx.writeFile(outPath);
  console.log("Đã ghi:", outPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
