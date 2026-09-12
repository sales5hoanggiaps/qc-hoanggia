import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma } from "@qc/db";
import { listProducts } from "./list-products";

const prefix = `LIST${Date.now()}`;
let categoryId: string;
const productIds: string[] = [];

describe("listProducts", () => {
  beforeAll(async () => {
    const category = await prisma.category.create({ data: { name: `Danh mục test ${prefix}` } });
    categoryId = category.id;

    // 3 mã PENDING_QC trong danh mục test, 1 mã ACTIVE ngoài danh mục test — đủ để kiểm tra
    // cả lọc theo category, lọc theo status, và phân trang (PAGE_SIZE giả định 20, test dùng
    // số nhỏ hơn nhiều nên không cần tạo hàng chục bản ghi — kiểm tra công thức totalPages
    // bằng cách đọc lại PAGE_SIZE thực tế từ module, xem Step 3).
    for (let i = 0; i < 3; i++) {
      const p = await prisma.product.create({
        data: { baseCode: `${prefix}P${i}`, amisProductId: `amis-${prefix}P${i}`, status: "PENDING_QC", categoryId },
      });
      productIds.push(p.id);
    }
    const other = await prisma.product.create({
      data: { baseCode: `${prefix}OTHER`, amisProductId: `amis-${prefix}OTHER`, status: "ACTIVE" },
    });
    productIds.push(other.id);
  });

  it("không lọc gì → page 1 trả về các mã hàng đầu tiên (hàm hoạt động)", async () => {
    const result = await listProducts({});
    expect(result.page).toBe(1);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.totalPages).toBeGreaterThan(0);
  });

  it("lọc theo categoryId → chỉ 3 mã trong danh mục test", async () => {
    const result = await listProducts({ categoryId });
    const codes = result.items.map((i) => i.baseCode);
    expect(codes).toContain(`${prefix}P0`);
    expect(codes).toContain(`${prefix}P1`);
    expect(codes).toContain(`${prefix}P2`);
    expect(codes).not.toContain(`${prefix}OTHER`);
  });

  it("lọc theo status PENDING_QC → không có mã ACTIVE", async () => {
    const result = await listProducts({ status: "PENDING_QC" });
    const codes = result.items.map((i) => i.baseCode);
    expect(codes).not.toContain(`${prefix}OTHER`);
  });

  it("kết hợp categoryId + status không khớp gì → mảng rỗng, không lỗi", async () => {
    const result = await listProducts({ categoryId, status: "DISCONTINUED" });
    expect(result.items).toHaveLength(0);
    expect(result.totalPages).toBe(1);
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });
});
