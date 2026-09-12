import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma } from "@qc/db";
import { searchProducts } from "./search-products";

// Regex phân tích hậu tố phiên bản chỉ chấp nhận 1-4 chữ cái + 4-7 chữ số (xem
// parse-version-suffix.ts) — dùng 2 chữ cái + 6 chữ số cuối của Date.now() để baseCode test
// khớp đúng mẫu đó, khác với 1 baseCode ngẫu nhiên dài tùy ý.
const baseCode = `SR${Date.now().toString().slice(-6)}`;
const customerName = `Khách hàng test ${Date.now()}`;
let productId: string;
let customerId: string;
let currentVersionId: string;
let oldVersionId: string;

describe("searchProducts", () => {
  beforeAll(async () => {
    const product = await prisma.product.create({
      data: { baseCode, amisProductId: `amis-${baseCode}`, status: "PENDING_QC" },
    });
    productId = product.id;
    const v1 = await prisma.productVersion.create({
      data: { productId, versionNumber: 1, amisProductId: `amis-v1-${baseCode}`, name: "Tên bản 1", isCurrent: false },
    });
    oldVersionId = v1.id;
    const v2 = await prisma.productVersion.create({
      data: { productId, versionNumber: 2, amisProductId: `amis-v2-${baseCode}`, name: "Tên bản 2 (hiện hành)", isCurrent: true },
    });
    currentVersionId = v2.id;
    await prisma.product.update({ where: { id: productId }, data: { currentVersionId } });

    const customer = await prisma.customer.create({ data: { amisCustomerId: `cust-${baseCode}`, name: customerName } });
    customerId = customer.id;
    await prisma.productCustomer.create({ data: { productId, customerId } });
  });

  it("gõ đúng mã.n của phiên bản HIỆN HÀNH → redirectTo trang chính", async () => {
    const outcome = await searchProducts(`${baseCode}.2`);
    expect(outcome.redirectTo).toBe(`/products/${baseCode}`);
    expect(outcome.results).toHaveLength(0);
  });

  it("gõ đúng mã.n của phiên bản CŨ → redirectTo trang chỉ đọc /v/[n]", async () => {
    const outcome = await searchProducts(`${baseCode}.1`);
    expect(outcome.redirectTo).toBe(`/products/${baseCode}/v/1`);
  });

  it("gõ mã gốc không hậu tố → tìm gần đúng, không redirect, trả về danh sách", async () => {
    const outcome = await searchProducts(baseCode);
    expect(outcome.redirectTo).toBeNull();
    expect(outcome.results.some((r) => r.baseCode === baseCode)).toBe(true);
  });

  it("gõ 1 phần tên khách hàng → trả về đúng mã hàng của khách đó, kèm tên khách", async () => {
    const outcome = await searchProducts(customerName.slice(0, 10));
    expect(outcome.redirectTo).toBeNull();
    const hit = outcome.results.find((r) => r.baseCode === baseCode);
    expect(hit).toBeDefined();
    expect(hit!.customerNames).toContain(customerName);
  });

  it("không khớp gì → trả về mảng rỗng, không lỗi", async () => {
    const outcome = await searchProducts("khong-ton-tai-xyz-123456789");
    expect(outcome.redirectTo).toBeNull();
    expect(outcome.results).toHaveLength(0);
  });

  afterAll(async () => {
    await prisma.productCustomer.deleteMany({ where: { productId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.productVersion.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.$disconnect();
  });
});
