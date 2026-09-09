import { describe, expect, it } from "vitest";
import { formatVersionLabel } from "./format";

describe("formatVersionLabel", () => {
  it("nối mã gốc và số phiên bản bằng dấu chấm", () => {
    expect(formatVersionLabel("SI08694", 1)).toBe("SI08694.1");
    expect(formatVersionLabel("SI08694", 12)).toBe("SI08694.12");
  });
});
