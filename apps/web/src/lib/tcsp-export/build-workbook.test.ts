import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildTcspWorkbook } from "./build-workbook";

function baseInput() {
  return {
    baseCode: "SI99999",
    versionNumber: 3,
    name: "Nhãn test",
    materialCode: "NL-001",
    description: "Mô tả test",
    preparedBy: "Nguyễn Văn A",
    approvedBy: "Trần Thị B",
    approvedAt: new Date("2026-01-15"),
    specRows: [
      { groupName: "Kích thước", criterion: "Chiều dài", value: "150", tolerance: "± 1", unit: "mm", note: "" },
      { groupName: "Kích thước", criterion: "Chiều rộng", value: "100", tolerance: "± 1", unit: "mm", note: "" },
      { groupName: "TC khác", criterion: "Đóng gói", value: "Tiêu chuẩn", tolerance: "", unit: "", note: "" },
    ],
    imageBuffer: null as Buffer | null,
  };
}

async function readBack(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  // exceljs's own .d.ts resolves "Buffer" via a different (older, @fast-csv-bundled) @types/node
  // than this project's — nominally incompatible types, same runtime class, so `as unknown as
  // Buffer` still resolves to OUR (new) Buffer and doesn't help; drop to `any` at this one crossing.
  // See build-workbook.ts's addImage/writeBuffer comments for the same issue.
  await wb.xlsx.load(buffer as any);
  return wb.getWorksheet("TCSP")!;
}

describe("buildTcspWorkbook", () => {
  it("điền đúng các ô cố định và đúng số dòng thông số (3 dòng, khác mẫu ví dụ 9 dòng)", async () => {
    const buffer = await buildTcspWorkbook(baseInput());
    const sheet = await readBack(buffer);
    expect(sheet.getCell("B3").value).toBe("SI99999.3");
    expect(sheet.getCell("D3").value).toBe("Nhãn test");
    expect(sheet.getCell("B5").value).toBe("Mô tả test");
    expect(sheet.getCell("B6").value).toBe("NL-001");
    expect(sheet.getCell("A8").value).toBe("Kích thước");
    expect(sheet.getCell("B8").value).toBe("Chiều dài");
    expect(sheet.getCell("A10").value).toBe("TC khác");
    expect(sheet.getCell("B10").value).toBe("Đóng gói");
  });

  it("co giãn đúng khi số dòng NHIỀU HƠN mẫu ví dụ (12 dòng)", async () => {
    const input = baseInput();
    input.specRows = Array.from({ length: 12 }, (_, i) => ({
      groupName: i < 5 ? "Kích thước" : "TC khác",
      criterion: `Tiêu chí ${i}`,
      value: String(i),
      tolerance: "",
      unit: "",
      note: "",
    }));
    const buffer = await buildTcspWorkbook(input);
    const sheet = await readBack(buffer);
    expect(sheet.getCell("B8").value).toBe("Tiêu chí 0");
    expect(sheet.getCell("B19").value).toBe("Tiêu chí 11"); // dòng 8 + 11 = 19, dòng cuối
    expect(sheet.getCell("A8").value).toBe("Kích thước");
    expect(sheet.getCell("A13").value).toBe("TC khác");
  });

  it("footer Người lập/duyệt/ngày dịch đúng theo số dòng thông số", async () => {
    const buffer = await buildTcspWorkbook(baseInput()); // 3 dòng thông số
    const sheet = await readBack(buffer);
    // 3 dòng thông số bắt đầu dòng 8 -> kết thúc dòng 10, cách 1 dòng trống -> footer dòng 12.
    expect(sheet.getCell("B12").value).toBe("Nguyễn Văn A");
    expect(sheet.getCell("E12").value).toBe("Trần Thị B");
  });

  it("không có specRows vẫn xuất được, không lỗi", async () => {
    const input = baseInput();
    input.specRows = [];
    const buffer = await buildTcspWorkbook(input);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
