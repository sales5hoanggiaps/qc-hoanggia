# Tìm kiếm & Danh sách mã hàng (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the homepage search (single box, exact-version redirect, inline results) and the standalone product list page (filter by category/status, pagination) — the last unbuilt page in the roadmap (spec §13 phase 4).

**Architecture:** Two read-only Next.js Server Components (`(dashboard)/page.tsx` rewritten, new `(dashboard)/danh-sach/page.tsx`), each backed by a small pure query-logic module in `apps/web/src/lib/products/`. No new API routes, no client-side JS beyond native HTML forms (GET, so filters/search live entirely in the URL's `searchParams` — matches this app's existing server-component-first pattern). No new Prisma models — `Product`/`ProductVersion`/`Customer`/`ProductCustomer`/`Category` already fully support this.

**Tech Stack:** Next.js 14 App Router Server Components, Prisma (Postgres `ILIKE` via `contains`/`mode: "insensitive"`), Vitest + real local Postgres for the query-logic tests (no mocking — matches this project's established testing discipline).

**Spec:** docs/superpowers/specs/2026-09-09-qc-hoanggia-design.md §9 (chốt thiết kế chi tiết 2026-09-12)

## Global Constraints

- Trang chủ (`/`): mã có hậu tố phiên bản (`<baseCode>.<n>`) khớp đúng 1 kết quả duy nhất → chuyển hướng thẳng (hiện hành → `/products/[baseCode]`; cũ → `/products/[baseCode]/v/[n]`, chỉ đọc). Mọi trường hợp khác → hiển thị danh sách kết quả **ngay trên trang chủ** (không chuyển trang).
- Tìm gần đúng không phân biệt hoa/thường (Postgres `ILIKE`) trên `Product.baseCode` **hoặc** tên khách hàng (qua `ProductCustomer` → `Customer`).
- Trang Danh sách mã hàng ở đúng route `/danh-sach` (route này đã có sẵn trong `DashboardNav.tsx` từ Foundation — không đổi tên route).
- Bảng Danh sách: Mã hàng / Tên hàng hoá / Loại sản phẩm / Trạng thái, lọc theo Loại sản phẩm + Trạng thái, phân trang 20 dòng/trang.
- Cả 3 vai trò (QC_STAFF/MANAGER/ADMIN) dùng được cả 2 trang — không có phân quyền riêng, middleware (`apps/web/src/middleware.ts`) đã bảo vệ khỏi truy cập chưa đăng nhập; không cần gọi `auth()` riêng trong 2 trang này vì không có logic rẽ nhánh theo role.
- Không tạo API route mới — cả 2 trang đều là Server Component đọc `searchParams`, filter/tìm kiếm sống trong URL.

---

### Task 1: Tìm kiếm — trang chủ (khớp version, tìm gần đúng, kết quả inline)

**Files:**
- Create: `apps/web/src/lib/products/parse-version-suffix.ts`
- Create: `apps/web/src/lib/products/parse-version-suffix.test.ts`
- Create: `apps/web/src/lib/products/search-products.ts`
- Create: `apps/web/src/lib/products/search-products.test.ts`
- Modify: `apps/web/src/app/(dashboard)/page.tsx`

**Interfaces:**
- Produces: `parseVersionSuffix(code: string): { baseCode: string; versionNumber: number } | null` — pure function, no DB access.
- Produces: `searchProducts(rawQuery: string): Promise<{ redirectTo: string | null; results: SearchResultItem[] }>` where `SearchResultItem = { baseCode: string; name: string; customerNames: string[] }`.

**Bối cảnh:** `apps/worker/src/sync/version-detection.ts` đã có `parseVersionSuffix` với mẫu regex đã kiểm chứng trên 1000 mã thật (`^([A-Z]{1,4}\d{4,7})\.(\d{1,2})$`) — nhân bản 1 hàm tương tự sang `apps/web` (không đáng tách package riêng cho 1 hàm thuần ~10 dòng), có thêm `.toUpperCase()` vì input ở đây do người dùng gõ tay (khác với worker, nơi input luôn đã đúng hoa từ AMIS).

- [ ] **Step 1: Viết test thất bại cho `parseVersionSuffix`**

```ts
// apps/web/src/lib/products/parse-version-suffix.test.ts
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
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npm run test --workspace=apps/web -- parse-version-suffix`
Expected: FAIL — file `parse-version-suffix.ts` chưa tồn tại.

- [ ] **Step 3: Viết `parse-version-suffix.ts`**

```ts
// apps/web/src/lib/products/parse-version-suffix.ts

// Mẫu regex đã kiểm chứng khớp 100% trên 1000 mã hàng thật lấy từ AMIS (xem spec §6 và
// apps/worker/src/sync/version-detection.ts — bản gốc dùng cho đồng bộ). Bản này thêm
// .toUpperCase() vì input ở đây do NGƯỜI DÙNG gõ tay trong ô tìm kiếm (worker luôn nhận
// input đã đúng hoa từ AMIS, không cần bước này).
const VERSION_SUFFIX_RE = /^([A-Z]{1,4}\d{4,7})\.(\d{1,2})$/;

export function parseVersionSuffix(code: string): { baseCode: string; versionNumber: number } | null {
  const match = code.trim().toUpperCase().match(VERSION_SUFFIX_RE);
  if (!match) return null;
  return { baseCode: match[1], versionNumber: Number(match[2]) };
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npm run test --workspace=apps/web -- parse-version-suffix`
Expected: PASS (6 tests)

- [ ] **Step 5: Viết test thất bại cho `searchProducts` (Postgres thật)**

```ts
// apps/web/src/lib/products/search-products.test.ts
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
```

- [ ] **Step 6: Chạy test, xác nhận FAIL**

Run: `npm run test --workspace=apps/web -- search-products`
Expected: FAIL — file `search-products.ts` chưa tồn tại.

- [ ] **Step 7: Viết `search-products.ts`**

```ts
// apps/web/src/lib/products/search-products.ts
import { prisma } from "@qc/db";
import { parseVersionSuffix } from "./parse-version-suffix";

export interface SearchResultItem {
  baseCode: string;
  name: string;
  customerNames: string[];
}

export interface SearchOutcome {
  /** Khi khác null, caller (trang chủ) phải `redirect()` thẳng tới đây — không hiển thị danh sách. */
  redirectTo: string | null;
  results: SearchResultItem[];
}

/** Giới hạn số kết quả hiển thị trên trang chủ — trang Danh sách mã hàng (/danh-sach) có phân
 * trang thật cho việc duyệt/lọc số lượng lớn; ô tìm kiếm trang chủ chỉ cần đủ dùng cho tra cứu
 * nhanh, không cần phân trang riêng. */
const MAX_RESULTS = 50;

export async function searchProducts(rawQuery: string): Promise<SearchOutcome> {
  const q = rawQuery.trim();
  if (!q) return { redirectTo: null, results: [] };

  const parsed = parseVersionSuffix(q);
  if (parsed) {
    const product = await prisma.product.findUnique({ where: { baseCode: parsed.baseCode } });
    if (product) {
      const version = await prisma.productVersion.findFirst({
        where: { productId: product.id, versionNumber: parsed.versionNumber },
      });
      if (version) {
        const redirectTo = version.isCurrent
          ? `/products/${product.baseCode}`
          : `/products/${product.baseCode}/v/${version.versionNumber}`;
        return { redirectTo, results: [] };
      }
    }
    // Không tìm thấy đúng phiên bản đó (vd gõ nhầm số version) — rơi xuống tìm gần đúng bên
    // dưới bằng nguyên chuỗi gõ vào, không coi đây là lỗi.
  }

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { baseCode: { contains: q, mode: "insensitive" } },
        { customers: { some: { customer: { name: { contains: q, mode: "insensitive" } } } } },
      ],
    },
    include: { currentVersion: true, customers: { include: { customer: true } } },
    take: MAX_RESULTS,
    orderBy: { baseCode: "asc" },
  });

  return {
    redirectTo: null,
    results: products.map((p) => ({
      baseCode: p.baseCode,
      name: p.currentVersion?.name ?? "(chưa có tên)",
      customerNames: p.customers.map((c) => c.customer.name),
    })),
  };
}
```

- [ ] **Step 8: Chạy test, xác nhận PASS**

Run: `npm run test --workspace=apps/web -- search-products`
Expected: PASS (5 tests)

- [ ] **Step 9: Viết lại trang chủ dùng `searchProducts`**

```tsx
// apps/web/src/app/(dashboard)/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { searchProducts } from "@/lib/products/search-products";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = searchParams.q ?? "";
  const outcome = q.trim() ? await searchProducts(q) : null;
  if (outcome?.redirectTo) redirect(outcome.redirectTo);

  return (
    <main className="p-6">
      <h1 className="text-lg font-semibold">Tìm kiếm mã hàng</h1>
      <form className="mt-4 flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Nhập mã hàng hoặc tên khách hàng..."
          className="w-full max-w-md rounded border px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700">
          Tìm
        </button>
      </form>

      {outcome && (
        <div className="mt-6">
          {outcome.results.length === 0 ? (
            <p className="text-sm text-gray-400">Không tìm thấy kết quả cho &quot;{q}&quot;.</p>
          ) : (
            <ul className="divide-y rounded border text-sm">
              {outcome.results.map((r) => (
                <li key={r.baseCode}>
                  <Link href={`/products/${r.baseCode}`} className="flex items-center justify-between p-3 hover:bg-gray-50">
                    <span>
                      <span className="font-medium">{r.baseCode}</span> — {r.name}
                    </span>
                    {r.customerNames.length > 0 && (
                      <span className="text-xs text-gray-500">{r.customerNames.join(", ")}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 10: Chạy toàn bộ test suite**

Run: `npm run test --workspace=apps/web`
Expected: PASS (toàn bộ, không có test nào regress)

- [ ] **Step 11: Xác minh thủ công**

Chạy `npm run dev` (hoặc `next dev` đã có sẵn), đăng nhập, vào `/`:
- Gõ đúng 1 mã hàng thật đang có nhiều phiên bản kèm `.n` của bản CŨ → xác nhận chuyển thẳng tới `/products/<mã>/v/<n>` (chỉ đọc, đúng theo Plan 3a/3b).
- Gõ mã gốc (không hậu tố) của mã đó → xác nhận thấy danh sách kết quả ngay trên trang, không chuyển trang.
- Gõ 1 phần tên 1 khách hàng thật (kiểm tra trong DB) → xác nhận thấy đúng (các) mã hàng của khách đó.
- Gõ chuỗi vô nghĩa → xác nhận thấy "Không tìm thấy kết quả".

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/lib/products/parse-version-suffix.ts apps/web/src/lib/products/parse-version-suffix.test.ts apps/web/src/lib/products/search-products.ts apps/web/src/lib/products/search-products.test.ts "apps/web/src/app/(dashboard)/page.tsx"
git commit -m "feat(web): trang chủ tìm kiếm mã hàng — khớp version chuyển hướng thẳng, kết quả inline"
```

---

### Task 2: Trang Danh sách mã hàng (`/danh-sach`) — lọc + phân trang

**Files:**
- Create: `apps/web/src/lib/products/list-products.ts`
- Create: `apps/web/src/lib/products/list-products.test.ts`
- Create: `apps/web/src/app/(dashboard)/danh-sach/page.tsx`

**Interfaces:**
- Produces: `listProducts(params: { categoryId?: string; status?: ProductStatus; page?: number }): Promise<ListProductsResult>` where `ListProductsResult = { items: ListedProduct[]; page: number; totalPages: number }` and `ListedProduct = { baseCode: string; name: string; categoryName: string | null; status: ProductStatus }`.
- Consumes: `ProductStatus` enum từ `@qc/db` (giá trị: `ACTIVE`, `PENDING_QC`, `DISCONTINUED`).

**Không cần sửa `DashboardNav.tsx`** — link `/danh-sach` đã có sẵn từ Foundation, chỉ cần route thật tồn tại đúng đường dẫn đó.

- [ ] **Step 1: Viết test thất bại cho `listProducts`**

```ts
// apps/web/src/lib/products/list-products.test.ts
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

  it("không lọc gì → trả về tất cả (ít nhất 4 mã vừa tạo), page 1", async () => {
    const result = await listProducts({});
    expect(result.page).toBe(1);
    const codes = result.items.map((i) => i.baseCode);
    for (let i = 0; i < 3; i++) expect(codes).toContain(`${prefix}P${i}`);
    expect(codes).toContain(`${prefix}OTHER`);
  });

  it("lọc theo categoryId → chỉ 3 mã trong danh mục test", async () => {
    const result = await listProducts({ categoryId });
    const codes = result.items.map((i) => i.baseCode);
    expect(codes).toContain(`${prefix}P0`);
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
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npm run test --workspace=apps/web -- list-products`
Expected: FAIL — file `list-products.ts` chưa tồn tại.

- [ ] **Step 3: Viết `list-products.ts`**

```ts
// apps/web/src/lib/products/list-products.ts
import { prisma, type ProductStatus } from "@qc/db";

export const PAGE_SIZE = 20;

export interface ListProductsParams {
  categoryId?: string;
  status?: ProductStatus;
  page?: number;
}

export interface ListedProduct {
  baseCode: string;
  name: string;
  categoryName: string | null;
  status: ProductStatus;
}

export interface ListProductsResult {
  items: ListedProduct[];
  page: number;
  totalPages: number;
}

export async function listProducts(params: ListProductsParams): Promise<ListProductsResult> {
  const page = Math.max(1, params.page ?? 1);
  const where = {
    ...(params.categoryId ? { categoryId: params.categoryId } : {}),
    ...(params.status ? { status: params.status } : {}),
  };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { category: true, currentVersion: true },
      orderBy: { baseCode: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return {
    items: products.map((p) => ({
      baseCode: p.baseCode,
      name: p.currentVersion?.name ?? "(chưa có tên)",
      categoryName: p.category?.name ?? null,
      status: p.status,
    })),
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npm run test --workspace=apps/web -- list-products`
Expected: PASS (4 tests)

- [ ] **Step 5: Viết trang `/danh-sach`**

```tsx
// apps/web/src/app/(dashboard)/danh-sach/page.tsx
import Link from "next/link";
import { prisma, type ProductStatus } from "@qc/db";
import { listProducts } from "@/lib/products/list-products";

const STATUS_LABELS: Record<ProductStatus, string> = {
  ACTIVE: "Đang hoạt động",
  PENDING_QC: "Chờ bổ sung QC",
  DISCONTINUED: "Ngừng kinh doanh",
};

function isProductStatus(value: string): value is ProductStatus {
  return value in STATUS_LABELS;
}

export default async function ProductListPage({
  searchParams,
}: {
  searchParams: { category?: string; status?: string; page?: string };
}) {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const status = searchParams.status && isProductStatus(searchParams.status) ? searchParams.status : undefined;
  const page = Number(searchParams.page) || 1;

  const result = await listProducts({ categoryId: searchParams.category, status, page });

  function buildHref(overrides: { category?: string; status?: string; page?: string }) {
    const merged = { category: searchParams.category, status: searchParams.status, page: undefined as string | undefined, ...overrides };
    const params = new URLSearchParams();
    if (merged.category) params.set("category", merged.category);
    if (merged.status) params.set("status", merged.status);
    if (merged.page) params.set("page", merged.page);
    const qs = params.toString();
    return qs ? `/danh-sach?${qs}` : "/danh-sach";
  }

  return (
    <main className="p-6">
      <h1 className="text-lg font-semibold">Danh sách mã hàng</h1>

      <form className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <select name="category" defaultValue={searchParams.category ?? ""} className="rounded border px-2 py-1">
          <option value="">Tất cả loại sản phẩm</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="status" defaultValue={searchParams.status ?? ""} className="rounded border px-2 py-1">
          <option value="">Tất cả trạng thái</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button type="submit" className="rounded bg-brand-600 px-3 py-1 text-white hover:bg-brand-700">
          Lọc
        </button>
        <Link href={buildHref({ status: "PENDING_QC", category: undefined })} className="rounded border px-3 py-1 hover:bg-gray-50">
          Chỉ xem PENDING_QC
        </Link>
      </form>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Mã hàng</th>
            <th className="p-2">Tên hàng hoá</th>
            <th className="p-2">Loại sản phẩm</th>
            <th className="p-2">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((item) => (
            <tr key={item.baseCode} className="border-b hover:bg-gray-50">
              <td className="p-2">
                <Link href={`/products/${item.baseCode}`} className="text-brand-600 hover:underline">
                  {item.baseCode}
                </Link>
              </td>
              <td className="p-2">{item.name}</td>
              <td className="p-2">{item.categoryName ?? "—"}</td>
              <td className="p-2">{STATUS_LABELS[item.status]}</td>
            </tr>
          ))}
          {result.items.length === 0 && (
            <tr>
              <td colSpan={4} className="p-2 text-gray-400">Không có mã hàng nào khớp bộ lọc.</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-4 flex items-center gap-3 text-sm">
        <Link
          href={buildHref({ page: String(Math.max(1, result.page - 1)) })}
          className={result.page <= 1 ? "pointer-events-none text-gray-300" : "text-brand-600 hover:underline"}
        >
          « Trước
        </Link>
        <span>Trang {result.page}/{result.totalPages}</span>
        <Link
          href={buildHref({ page: String(Math.min(result.totalPages, result.page + 1)) })}
          className={result.page >= result.totalPages ? "pointer-events-none text-gray-300" : "text-brand-600 hover:underline"}
        >
          Sau »
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Chạy toàn bộ test suite**

Run: `npm run test --workspace=apps/web`
Expected: PASS (toàn bộ, không có test nào regress)

- [ ] **Step 7: Xác minh thủ công**

Chạy `npm run dev`, đăng nhập, click "Danh sách mã hàng" ở nav (đã có link sẵn):
- Xác nhận bảng hiện dữ liệu thật (baseCode/tên/loại/trạng thái).
- Lọc theo 1 Loại sản phẩm thật → xác nhận bảng chỉ còn đúng các mã thuộc loại đó.
- Click "Chỉ xem PENDING_QC" → xác nhận chỉ còn mã trạng thái đó.
- Nếu dữ liệu thật có hơn 20 mã sau khi lọc, xác nhận nút "Sau »" hoạt động và số trang tăng đúng.
- Click vào 1 mã hàng trong bảng → xác nhận mở đúng trang chi tiết mã đó.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/products/list-products.ts apps/web/src/lib/products/list-products.test.ts "apps/web/src/app/(dashboard)/danh-sach"
git commit -m "feat(web): trang Danh sách mã hàng — lọc theo loại/trạng thái, phân trang"
```

---
