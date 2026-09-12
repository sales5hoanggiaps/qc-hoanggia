import { describe, expect, it } from "vitest";
import { parseVersionSuffix } from "./parse-version-suffix";

describe("parseVersionSuffix", () => {
  it("khớp mã có hậu tố phiên bản hợp lệ", () => {
    expect(parseVersionSuffix("SI08694.1")).toEqual({ baseCode: "SI08694", versionNumber: 1 });
  });

  it("tự viết hoa mã gõ thường (khác worker — input ở đây do người dùng gõ tay)", () => {
    expect(parseVersionSuffix("si08694.1")).toEqual({ baseCode: "SI08694", versionNumber: 1 });
  });

  it("bỏ khoảng trắng thừa 2 đầu", () => {
    expect(parseVersionSuffix("  SI08694.1  ")).toEqual({ baseCode: "SI08694", versionNumber: 1 });
  });

  it("trả null nếu không có hậu tố", () => {
    expect(parseVersionSuffix("SI08694")).toBeNull();
  });

  it("trả null nếu phần chữ cái trước dấu chấm quá 4 ký tự", () => {
    expect(parseVersionSuffix("ABCDE1234.1")).toBeNull();
  });

  it("trả null với chuỗi rỗng hoặc không phải mã hàng", () => {
    expect(parseVersionSuffix("")).toBeNull();
    expect(parseVersionSuffix("khách hàng ABC")).toBeNull();
  });
});
