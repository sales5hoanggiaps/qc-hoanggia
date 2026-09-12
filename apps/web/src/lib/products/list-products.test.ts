import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma } from "@qc/db";
import { listProducts, PAGE_SIZE } from "./list-products";

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

describe("listProducts — phân trang", () => {
  const pagingPrefix = `LISTPAGE${Date.now()}`;
  let pagingCategoryId: string;
  const pagingProductIds: string[] = [];

  beforeAll(async () => {
    const category = await prisma.category.create({ data: { name: `Danh mục phân trang ${pagingPrefix}` } });
    pagingCategoryId = category.id;

    // PAGE_SIZE + 1 mã hàng cùng 1 danh mục riêng biệt → lọc theo categoryId này cho kết quả
    // xác định tuyệt đối (không phụ thuộc dữ liệu thật đã có sẵn trong DB), đủ để kiểm tra
    // công thức skip/totalPages đầu cuối — đúng nguyên nhân gốc của bug page: Infinity.
    for (let i = 0; i < PAGE_SIZE + 1; i++) {
      const p = await prisma.product.create({
        data: {
          baseCode: `${pagingPrefix}P${i}`,
          amisProductId: `amis-${pagingPrefix}P${i}`,
          status: "ACTIVE",
          categoryId: pagingCategoryId,
        },
      });
      pagingProductIds.push(p.id);
    }
  });

  it("không truyền page → trang 1 có đúng PAGE_SIZE mã, tổng 2 trang", async () => {
    const result = await listProducts({ categoryId: pagingCategoryId });
    expect(result.items).toHaveLength(PAGE_SIZE);
    expect(result.totalPages).toBe(2);
  });

  it("page: 2 → chỉ còn đúng 1 mã (mã thứ 21)", async () => {
    const result = await listProducts({ categoryId: pagingCategoryId, page: 2 });
    expect(result.items).toHaveLength(1);
  });

  it("page: Infinity → không crash, coi như trang 1", async () => {
    const result = await listProducts({ categoryId: pagingCategoryId, page: Infinity });
    expect(result.page).toBe(1);
    expect(result.items).toHaveLength(PAGE_SIZE);
  });

  it("page: 2.5 → làm tròn về số nguyên (trang 2), không lỗi phân số", async () => {
    const result = await listProducts({ categoryId: pagingCategoryId, page: 2.5 });
    expect(Number.isInteger(result.page)).toBe(true);
    expect(result.page).toBe(2);
  });

  it("page: -3 và page: 0 → coi như trang 1", async () => {
    const negative = await listProducts({ categoryId: pagingCategoryId, page: -3 });
    expect(negative.page).toBe(1);
    const zero = await listProducts({ categoryId: pagingCategoryId, page: 0 });
    expect(zero.page).toBe(1);
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: { in: pagingProductIds } } });
    await prisma.category.deleteMany({ where: { id: pagingCategoryId } });
    await prisma.$disconnect();
  });
});
