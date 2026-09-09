import { describe, expect, it } from "vitest";
import { parseVersionSuffix } from "./version-detection";

describe("parseVersionSuffix", () => {
  it("nhận diện đúng các mã phiên bản thật (đã xác nhận với AMIS 2026-09-09)", () => {
    expect(parseVersionSuffix("SI07284.1")).toEqual({ baseCode: "SI07284", versionNumber: 1 });
    expect(parseVersionSuffix("SI00653.3")).toEqual({ baseCode: "SI00653", versionNumber: 3 });
    expect(parseVersionSuffix("SI05797.3")).toEqual({ baseCode: "SI05797", versionNumber: 3 });
    expect(parseVersionSuffix("SI06088.1")).toEqual({ baseCode: "SI06088", versionNumber: 1 });
    expect(parseVersionSuffix("SI03979.1")).toEqual({ baseCode: "SI03979", versionNumber: 1 });
    expect(parseVersionSuffix("SI05060.1")).toEqual({ baseCode: "SI05060", versionNumber: 1 });
    expect(parseVersionSuffix("AA09511.1")).toEqual({ baseCode: "AA09511", versionNumber: 1 });
  });

  it("KHÔNG nhận diện kiểu đánh số nội bộ khác của AMIS (không phải phiên bản)", () => {
    expect(parseVersionSuffix("AA03.000170")).toBeNull();
    expect(parseVersionSuffix("AA08.00012")).toBeNull();
    expect(parseVersionSuffix("AA01.00243")).toBeNull();
    expect(parseVersionSuffix("AA04.000148")).toBeNull();
    expect(parseVersionSuffix("CPTVPPKTQ4.26")).toBeNull();
  });

  it("trả về null cho mã không có dấu chấm", () => {
    expect(parseVersionSuffix("SI08701")).toBeNull();
  });
});
