import { describe, expect, it } from "vitest";
import { extractErrorMessage } from "./extract-error-message";

describe("extractErrorMessage", () => {
  it("trả nguyên câu khi error là chuỗi", () => {
    expect(extractErrorMessage({ error: "Không đủ quyền truy cập" }, "fallback")).toBe("Không đủ quyền truy cập");
  });

  it("lấy dòng đầu trong formErrors khi error là zod .flatten()", () => {
    expect(extractErrorMessage({ error: { formErrors: ["Dữ liệu không hợp lệ"], fieldErrors: {} } }, "fallback")).toBe(
      "Dữ liệu không hợp lệ"
    );
  });

  it("lấy lỗi field đầu tiên khi formErrors rỗng nhưng fieldErrors có", () => {
    expect(
      extractErrorMessage({ error: { formErrors: [], fieldErrors: { approvedAt: ["Ngày duyệt không hợp lệ"] } } }, "fallback")
    ).toBe("Ngày duyệt không hợp lệ");
  });

  it("trả fallback khi body không có field error nào dùng được", () => {
    expect(extractErrorMessage({}, "fallback")).toBe("fallback");
    expect(extractErrorMessage(null, "fallback")).toBe("fallback");
    expect(extractErrorMessage({ error: { formErrors: [], fieldErrors: {} } }, "fallback")).toBe("fallback");
    expect(extractErrorMessage({ error: "" }, "fallback")).toBe("fallback");
  });
});
