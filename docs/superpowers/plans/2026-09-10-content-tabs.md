# Content Tabs (Plan 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the product detail page (`/products/[baseCode]`) with its 5 tabs — Tiêu chuẩn sản phẩm (TCSP), QC sản phẩm, Quy cách đóng gói, Giấy tờ sản phẩm, Lịch sử phiên bản — with view/edit for the three text-content tabs (Manager+/Admin), a read-only shell for Documents (media upload lands in Plan 3b), and full change-history tracking. This turns the ~4500 already-synced-but-empty products into something a Manager can actually fill in.

**Architecture:** One server-component page (`page.tsx`) fetches the whole product + current version + all 4 content tables + version/changelog history in a single Prisma query, and hands it to a client-component tab shell (`ProductDetailTabs`) that switches tabs locally (no extra routing) and toggles each tab between view and edit mode. Edits go through per-section `PATCH` API routes that always resolve to `Product.currentVersionId` server-side (never trust a client-supplied version id), diff the changed fields, and write `ChangeLogEntry` rows via one small shared helper reused across all three editable tabs.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma via `@qc/db`, Tailwind, Zod, Vitest + React Testing Library — all already established by the Foundation plan; no new dependencies.

**Spec:** [docs/superpowers/specs/2026-09-09-qc-hoanggia-design.md](../specs/2026-09-09-qc-hoanggia-design.md) §7 (as amended 2026-09-10 for the Plan 3a/3b split), §12 (the dropped-version-on-collision finding this plan's version banner defends against)

## Global Constraints

- App QC **không bao giờ** tạo mã hàng/phiên bản mới qua UI/API — this plan only ever edits `TCSPData`/`QCData`/`PackagingData`/`DocumentsData`/`ChangeLogEntry` on the EXISTING `Product.currentVersionId`, never creates a `Product` or `ProductVersion`.
- Chỉ MANAGER/ADMIN được sửa nội dung; QC_STAFF chỉ xem (spec §5, §7).
- Phiên bản cũ (không phải `currentVersion`) luôn chỉ đọc — không có nút Chỉnh sửa (spec §7).
- Mỗi lần lưu thay đổi ghi `ChangeLogEntry` nguồn `MANUAL` (field, giá trị cũ/mới, người sửa) (spec §7).
- Form sửa phải hiển thị rõ `versionNumber`/mã AMIS gốc của phiên bản đang xem, do phát hiện ở spec §12 rằng một số mã AMIS bị âm thầm bỏ qua khi trùng số phiên bản — người dùng cần cách tự nhận ra nội dung "kế thừa" có vẻ không khớp.
- Giao diện tiếng Việt.
- Node >= 20.

---

## File Structure

```
apps/web/src/
  app/
    (dashboard)/
      products/
        [baseCode]/
          page.tsx                    # Task 1 — fetches everything, renders ProductDetailTabs
          v/
            [versionNumber]/
              page.tsx                # Task 7 — read-only old-version view, same tabs, no edit
    api/
      products/
        [baseCode]/
          tcsp/route.ts                # Task 2 — PATCH
          tcsp/route.test.ts
          qc/route.ts                  # Task 3 — PATCH
          qc/route.test.ts
          packaging/route.ts           # Task 4 — PATCH
          packaging/route.test.ts
  components/
    products/
      ProductDetailTabs.tsx            # Task 1 — client, tab switching + view/edit state
      ProductDetailTabs.test.tsx
      VersionBanner.tsx                # Task 1 — "Đang xem phiên bản <baseCode>.<n> (mã AMIS: ...)"
      TCSPTab.tsx                      # Task 2 — view + edit form
      QCTab.tsx                        # Task 3
      PackagingTab.tsx                 # Task 4
      DocumentsTab.tsx                 # Task 5 — read-only empty-state shell
      HistoryTab.tsx                   # Task 6 — version list + changelog
  lib/
    products/
      change-log.ts                    # Task 2 — diffFields() + recordChanges(), shared by Tasks 2-4
      change-log.test.ts
      get-product-detail.ts            # Task 1 — the shared Prisma query, reused by Tasks 1 and 7
```

---

### Task 1: Detail page shell + data fetching + tab navigation

**Files:**
- Create: `apps/web/src/lib/products/get-product-detail.ts`
- Create: `apps/web/src/app/(dashboard)/products/[baseCode]/page.tsx`
- Create: `apps/web/src/components/products/ProductDetailTabs.tsx`
- Create: `apps/web/src/components/products/ProductDetailTabs.test.tsx`
- Create: `apps/web/src/components/products/VersionBanner.tsx`

**Interfaces:**
- Produces: `getProductDetail(baseCode: string): Promise<ProductDetail | null>` where `ProductDetail` is the exact shape defined in Step 1 below — Tasks 2-7 all consume this same shape (either directly, via the page, or via the same query reused in Task 7's route).
- Produces: `<ProductDetailTabs product={ProductDetail} role={UserRole} />` — a client component owning which of the 5 tabs is active and whether the active tab is in edit mode. Tasks 2-6 each render as a named tab inside it.
- Produces: `<VersionBanner version={{ baseCode: string; versionNumber: number; amisProductId: string; isCurrent: boolean }} />` — reused by every tab's edit form (Tasks 2-4) and by Task 7's read-only page.

- [ ] **Step 1: Write `apps/web/src/lib/products/get-product-detail.ts`**

```ts
import { prisma } from "@qc/db";

export async function getProductDetail(baseCode: string) {
  return prisma.product.findUnique({
    where: { baseCode },
    include: {
      category: true,
      currentVersion: {
        include: {
          tcsp: { include: { specRows: { orderBy: { sortOrder: "asc" } } } },
          qc: true,
          packaging: true,
          documents: { include: { files: true } },
        },
      },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: { changeLogs: { orderBy: { changedAt: "desc" } } },
      },
    },
  });
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductDetail>>>;
```

- [ ] **Step 2: Write `apps/web/src/components/products/VersionBanner.tsx`**

```tsx
export function VersionBanner({
  version,
}: {
  version: { baseCode: string; versionNumber: number; amisProductId: string; isCurrent: boolean };
}) {
  return (
    <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      Đang xem <strong>{version.baseCode}.{version.versionNumber}</strong> (mã AMIS gốc:{" "}
      <code>{version.amisProductId}</code>)
      {!version.isCurrent && <span className="ml-2 font-semibold">— PHIÊN BẢN CŨ, CHỈ ĐỌC</span>}
    </div>
  );
}
```

- [ ] **Step 3: Write `apps/web/src/app/(dashboard)/products/[baseCode]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProductDetail } from "@/lib/products/get-product-detail";
import { ProductDetailTabs } from "@/components/products/ProductDetailTabs";

export default async function ProductDetailPage({ params }: { params: { baseCode: string } }) {
  const session = await auth();
  // Middleware already requires a session for every route under (dashboard), but don't rely on
  // that alone here — fail safe with an explicit redirect instead of a non-null assertion
  // (a Foundation-phase final review flagged the same `session!` pattern elsewhere as worth
  // avoiding; this plan follows that guidance in new code rather than repeating it).
  if (!session) redirect("/login");

  const product = await getProductDetail(params.baseCode);
  if (!product || !product.currentVersion) notFound();

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">
        {product.baseCode} — {product.currentVersion.name}
      </h1>
      <p className="mb-4 text-sm text-gray-500">
        {product.category?.name ?? "Chưa phân loại"} · Trạng thái: {product.status}
      </p>
      <ProductDetailTabs product={product} role={session.user.role} />
    </div>
  );
}
```

- [ ] **Step 4: Write the failing test for `ProductDetailTabs`**

```tsx
// apps/web/src/components/products/ProductDetailTabs.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserRole } from "@qc/db";
import { ProductDetailTabs } from "./ProductDetailTabs";
import type { ProductDetail } from "@/lib/products/get-product-detail";

function makeProduct(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: "p1",
    baseCode: "SI99999",
    amisProductId: "code:SI99999",
    categoryId: null,
    category: null,
    status: "PENDING_QC",
    currentVersionId: "v1",
    createdAt: new Date(),
    updatedAt: new Date(),
    currentVersion: {
      id: "v1",
      productId: "p1",
      versionNumber: 1,
      amisProductId: "code:SI99999",
      name: "Sản phẩm test",
      description: null,
      isCurrent: true,
      createdByAmisSync: true,
      createdAt: new Date(),
      tcsp: null,
      qc: null,
      packaging: null,
      documents: null,
    },
    versions: [],
    ...overrides,
  } as ProductDetail;
}

describe("ProductDetailTabs", () => {
  it("QC_STAFF thấy 5 tab nhưng không thấy nút Chỉnh sửa", () => {
    render(<ProductDetailTabs product={makeProduct()} role={UserRole.QC_STAFF} />);
    for (const label of ["Tiêu chuẩn sản phẩm", "QC sản phẩm", "Quy cách đóng gói", "Giấy tờ sản phẩm", "Lịch sử phiên bản"]) {
      expect(screen.getByText(label)).toBeDefined();
    }
    expect(screen.queryByText("Chỉnh sửa")).toBeNull();
  });

  it("MANAGER thấy nút Chỉnh sửa ở tab TCSP (tab mặc định)", () => {
    render(<ProductDetailTabs product={makeProduct()} role={UserRole.MANAGER} />);
    expect(screen.getByText("Chỉnh sửa")).toBeDefined();
  });

  it("chuyển sang tab Lịch sử phiên bản thì không còn nút Chỉnh sửa (tab đó không sửa được)", () => {
    render(<ProductDetailTabs product={makeProduct()} role={UserRole.MANAGER} />);
    screen.getByText("Lịch sử phiên bản").click();
    expect(screen.queryByText("Chỉnh sửa")).toBeNull();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm run test --workspace=apps/web`
Expected: FAIL — `./ProductDetailTabs` doesn't exist.

- [ ] **Step 6: Write `apps/web/src/components/products/ProductDetailTabs.tsx`**

For this task, `TCSPTab`/`QCTab`/`PackagingTab`/`DocumentsTab`/`HistoryTab` don't exist yet (Tasks 2-6 create them) — write minimal inline placeholders here so the shell compiles and is testable now; Tasks 2-6 will replace each placeholder with a real `import` one at a time.

```tsx
"use client";

import { useState } from "react";
import { UserRole } from "@qc/db";
import type { ProductDetail } from "@/lib/products/get-product-detail";

const TABS = ["Tiêu chuẩn sản phẩm", "QC sản phẩm", "Quy cách đóng gói", "Giấy tờ sản phẩm", "Lịch sử phiên bản"] as const;
type TabName = (typeof TABS)[number];

export function ProductDetailTabs({ product, role }: { product: ProductDetail; role: UserRole }) {
  const [activeTab, setActiveTab] = useState<TabName>("Tiêu chuẩn sản phẩm");
  const [editing, setEditing] = useState(false);
  const canEdit = role === UserRole.MANAGER || role === UserRole.ADMIN;
  const editableTabs: TabName[] = ["Tiêu chuẩn sản phẩm", "QC sản phẩm", "Quy cách đóng gói"];
  const showEditButton = canEdit && editableTabs.includes(activeTab) && !editing;

  function switchTab(tab: TabName) {
    setActiveTab(tab);
    setEditing(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b">
        <nav className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              className={`px-3 py-2 text-sm ${activeTab === tab ? "border-b-2 border-brand-600 font-medium" : "text-gray-500"}`}
            >
              {tab}
            </button>
          ))}
        </nav>
        {showEditButton && (
          <button onClick={() => setEditing(true)} className="mb-1 rounded bg-brand-600 px-3 py-1 text-sm text-white hover:bg-brand-700">
            Chỉnh sửa
          </button>
        )}
      </div>
      <div className="py-4">
        {activeTab === "Tiêu chuẩn sản phẩm" && <div data-testid="tab-tcsp">(TCSP — Task 2)</div>}
        {activeTab === "QC sản phẩm" && <div data-testid="tab-qc">(QC — Task 3)</div>}
        {activeTab === "Quy cách đóng gói" && <div data-testid="tab-packaging">(Đóng gói — Task 4)</div>}
        {activeTab === "Giấy tờ sản phẩm" && <div data-testid="tab-documents">(Giấy tờ — Task 5)</div>}
        {activeTab === "Lịch sử phiên bản" && <div data-testid="tab-history">(Lịch sử — Task 6)</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm run test --workspace=apps/web`
Expected: PASS (3 tests)

- [ ] **Step 8: Manual verification**

Run `npm run dev`, log in as `admin`, navigate to `/products/<a real baseCode from the synced data>` (e.g. query `SELECT "baseCode" FROM "Product" LIMIT 1;` via `npm run prisma:studio --workspace=packages/db` to find one). Expected: page loads, shows the 5 tabs, "Chỉnh sửa" appears on the TCSP tab.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/products/get-product-detail.ts apps/web/src/app/\(dashboard\)/products apps/web/src/components/products/ProductDetailTabs.tsx apps/web/src/components/products/ProductDetailTabs.test.tsx apps/web/src/components/products/VersionBanner.tsx
git commit -m "feat(web): product detail page shell — 5-tab shell, data fetching, view/edit toggle"
```

---

### Task 2: TCSP tab (view + edit) + shared change-log helper

**Files:**
- Create: `apps/web/src/lib/products/change-log.ts`
- Create: `apps/web/src/lib/products/change-log.test.ts`
- Create: `apps/web/src/components/products/TCSPTab.tsx`
- Create: `apps/web/src/app/api/products/[baseCode]/tcsp/route.ts`
- Create: `apps/web/src/app/api/products/[baseCode]/tcsp/route.test.ts`
- Modify: `apps/web/src/components/products/ProductDetailTabs.tsx` (replace the TCSP placeholder with a real `<TCSPTab>`)

**Interfaces:**
- Produces: `diffFields<T>(before, after): FieldChange[]` and `recordChanges(versionId, changedBy, changes): Promise<void>` from `change-log.ts` — Tasks 3 and 4 import and reuse both unchanged.
- Produces: `<TCSPTab product={ProductDetail} editing={boolean} onSaved={() => void} role={UserRole} />`.
- Consumes: `getProductDetail`'s `ProductDetail` shape (Task 1), `VersionBanner` (Task 1), `assertRole`/`ForbiddenError` (`@/lib/auth/guard`), `auth` (`@/lib/auth`).

- [ ] **Step 1: Write the failing test for `diffFields`/`recordChanges`**

```ts
// apps/web/src/lib/products/change-log.test.ts
import { describe, expect, it, afterAll } from "vitest";
import { prisma, UserRole } from "@qc/db";
import { diffFields, recordChanges } from "./change-log";

describe("diffFields", () => {
  it("chỉ trả về các field thực sự thay đổi", () => {
    const changes = diffFields({ a: "1", b: "x" }, { a: "1", b: "y" });
    expect(changes).toEqual([{ fieldPath: "b", oldValue: "x", newValue: "y" }]);
  });

  it("coi null cũ (chưa có dữ liệu) là hợp lệ khi so sánh", () => {
    const changes = diffFields(null, { a: "1" });
    expect(changes).toEqual([{ fieldPath: "a", oldValue: null, newValue: "1" }]);
  });

  it("trả về mảng rỗng khi không có gì đổi", () => {
    expect(diffFields({ a: "1" }, { a: "1" })).toEqual([]);
  });
});

describe("recordChanges", () => {
  let testUser: { id: string };
  let testVersion: { id: string };

  it("ghi ChangeLogEntry nguồn MANUAL cho từng field đổi", async () => {
    testUser = await prisma.user.create({
      data: { fullName: "CL Test", username: `cltest${Date.now()}`, passwordHash: "x", role: UserRole.MANAGER },
    });
    const product = await prisma.product.create({
      data: { baseCode: `CLTEST${Date.now()}`, amisProductId: `cltest-${Date.now()}`, status: "PENDING_QC" },
    });
    testVersion = await prisma.productVersion.create({
      data: { productId: product.id, versionNumber: 1, amisProductId: `cltest-v-${Date.now()}`, name: "x", isCurrent: true },
    });

    await recordChanges(testVersion.id, testUser.id, [{ fieldPath: "description", oldValue: null, newValue: "Mô tả mới" }]);

    const logs = await prisma.changeLogEntry.findMany({ where: { versionId: testVersion.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ fieldPath: "description", oldValue: null, newValue: "Mô tả mới", changedBy: testUser.id, source: "MANUAL" });
  });

  it("không ghi gì khi mảng changes rỗng", async () => {
    await recordChanges(testVersion.id, testUser.id, []);
    const logs = await prisma.changeLogEntry.findMany({ where: { versionId: testVersion.id } });
    expect(logs).toHaveLength(1); // vẫn chỉ 1 dòng từ test trước, không tăng thêm
  });

  afterAll(async () => {
    await prisma.changeLogEntry.deleteMany({ where: { versionId: testVersion.id } });
    await prisma.productVersion.deleteMany({ where: { id: testVersion.id } });
    await prisma.product.deleteMany({ where: { baseCode: { startsWith: "CLTEST" } } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/web`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write `apps/web/src/lib/products/change-log.ts`**

```ts
import { prisma } from "@qc/db";

export interface FieldChange {
  fieldPath: string;
  oldValue: string | null;
  newValue: string | null;
}

/** So sánh 2 object cùng shape (giá trị string/null), trả về danh sách field thực sự khác nhau.
 * `before` là null khi bản ghi (vd TCSPData) chưa từng tồn tại — mọi field trong `after` khác null coi là 1 thay đổi. */
export function diffFields<T extends Record<string, string | null>>(before: T | null, after: T): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const key of Object.keys(after) as (keyof T & string)[]) {
    const oldVal = before ? before[key] : null;
    const newVal = after[key];
    if (oldVal !== newVal) {
      changes.push({ fieldPath: key, oldValue: oldVal, newValue: newVal });
    }
  }
  return changes;
}

export async function recordChanges(versionId: string, changedBy: string, changes: FieldChange[]): Promise<void> {
  if (changes.length === 0) return;
  await prisma.changeLogEntry.createMany({
    data: changes.map((c) => ({
      versionId,
      fieldPath: c.fieldPath,
      oldValue: c.oldValue,
      newValue: c.newValue,
      changedBy,
      source: "MANUAL",
    })),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/web`
Expected: PASS (5 tests)

- [ ] **Step 5: Write the failing test for the TCSP PATCH route**

```ts
// apps/web/src/app/api/products/[baseCode]/tcsp/route.test.ts
import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma, UserRole } from "@qc/db";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
import { PATCH } from "./route";

function mockSession(role: UserRole | null) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    role ? { user: { id: "u1", username: "test", fullName: "Test", role } } : null
  );
}

const baseCode = `TCSPRT${Date.now()}`;
let versionId: string;

describe("/api/products/[baseCode]/tcsp", () => {
  beforeAll(async () => {
    const product = await prisma.product.create({
      data: { baseCode, amisProductId: `amis-${baseCode}`, status: "PENDING_QC" },
    });
    const version = await prisma.productVersion.create({
      data: { productId: product.id, versionNumber: 1, amisProductId: `amis-v-${baseCode}`, name: "Test", isCurrent: true },
    });
    await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: version.id } });
    versionId = version.id;
  });

  beforeEach(() => vi.clearAllMocks());

  it("trả 403 khi là QC_STAFF", async () => {
    mockSession(UserRole.QC_STAFF);
    const req = new Request(`http://localhost/api/products/${baseCode}/tcsp`, {
      method: "PATCH",
      body: JSON.stringify({ description: "x", specRows: [] }),
    });
    const res = await PATCH(req, { params: { baseCode } });
    expect(res.status).toBe(403);
  });

  it("MANAGER lưu được, tạo TCSPData mới nếu chưa có, và ghi ChangeLogEntry", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/tcsp`, {
      method: "PATCH",
      body: JSON.stringify({
        materialCode: "NL001",
        description: "Màng OPP 2 lớp",
        preparedBy: "Quân",
        approvedBy: null,
        approvedAt: null,
        specRows: [{ groupName: "Kích thước", criterion: "Chiều dài", value: "1000", tolerance: "±1", unit: "m", note: "", sortOrder: 0 }],
      }),
    });
    const res = await PATCH(req, { params: { baseCode } });
    expect(res.status).toBe(200);

    const tcsp = await prisma.tCSPData.findUnique({ where: { versionId }, include: { specRows: true } });
    expect(tcsp?.description).toBe("Màng OPP 2 lớp");
    expect(tcsp?.specRows).toHaveLength(1);

    const logs = await prisma.changeLogEntry.findMany({ where: { versionId } });
    expect(logs.some((l) => l.fieldPath === "description" && l.newValue === "Màng OPP 2 lớp")).toBe(true);
  });

  afterAll(async () => {
    const tcsp = await prisma.tCSPData.findUnique({ where: { versionId } });
    if (tcsp) {
      await prisma.tCSPSpecRow.deleteMany({ where: { tcspId: tcsp.id } });
      await prisma.tCSPData.delete({ where: { id: tcsp.id } });
    }
    await prisma.changeLogEntry.deleteMany({ where: { versionId } });
    await prisma.productVersion.deleteMany({ where: { id: versionId } });
    await prisma.product.deleteMany({ where: { baseCode } });
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test --workspace=apps/web`
Expected: FAIL — `./route` doesn't exist.

- [ ] **Step 7: Write `apps/web/src/app/api/products/[baseCode]/tcsp/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";
import { diffFields, recordChanges } from "@/lib/products/change-log";

const specRowSchema = z.object({
  groupName: z.string().min(1),
  criterion: z.string().min(1),
  value: z.string(),
  tolerance: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  sortOrder: z.number(),
});

const tcspSchema = z.object({
  materialCode: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  preparedBy: z.string().nullable().optional(),
  approvedBy: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  specRows: z.array(specRowSchema),
});

export async function PATCH(req: Request, { params }: { params: { baseCode: string } }) {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.MANAGER, UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const product = await prisma.product.findUnique({ where: { baseCode: params.baseCode } });
  if (!product || !product.currentVersionId) {
    return NextResponse.json({ error: "Không tìm thấy mã hàng" }, { status: 404 });
  }

  const parsed = tcspSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const versionId = product.currentVersionId;
  const existing = await prisma.tCSPData.findUnique({ where: { versionId } });

  const nextScalars = {
    materialCode: parsed.data.materialCode ?? null,
    description: parsed.data.description ?? null,
    preparedBy: parsed.data.preparedBy ?? null,
    approvedBy: parsed.data.approvedBy ?? null,
    approvedAt: parsed.data.approvedAt ?? null,
  };
  const prevScalars = existing
    ? {
        materialCode: existing.materialCode,
        description: existing.description,
        preparedBy: existing.preparedBy,
        approvedBy: existing.approvedBy,
        approvedAt: existing.approvedAt ? existing.approvedAt.toISOString() : null,
      }
    : null;
  const changes = diffFields(prevScalars, nextScalars);
  if (existing && (existing.specRows?.length ?? 0) >= 0) {
    // Bảng specRows luôn ghi đè toàn bộ (giống pattern OrderItem của hoanggia-crm) — ghi 1 dòng log
    // tổng hợp thay vì diff từng dòng, đơn giản và đủ dùng cho v1.
    changes.push({ fieldPath: "specRows", oldValue: null, newValue: `${parsed.data.specRows.length} dòng` });
  }

  const tcspData = await prisma.tCSPData.upsert({
    where: { versionId },
    update: { ...nextScalars, approvedAt: nextScalars.approvedAt ? new Date(nextScalars.approvedAt) : null },
    create: { versionId, ...nextScalars, approvedAt: nextScalars.approvedAt ? new Date(nextScalars.approvedAt) : null },
  });

  await prisma.tCSPSpecRow.deleteMany({ where: { tcspId: tcspData.id } });
  if (parsed.data.specRows.length > 0) {
    await prisma.tCSPSpecRow.createMany({
      data: parsed.data.specRows.map((row) => ({ ...row, tcspId: tcspData.id })),
    });
  }

  await recordChanges(versionId, session!.user.id, changes);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run test --workspace=apps/web`
Expected: PASS (2 tests)

- [ ] **Step 9: Write `apps/web/src/components/products/TCSPTab.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VersionBanner } from "./VersionBanner";
import type { ProductDetail } from "@/lib/products/get-product-detail";

interface SpecRow {
  groupName: string;
  criterion: string;
  value: string;
  tolerance: string;
  unit: string;
  note: string;
  sortOrder: number;
}

export function TCSPTab({
  product,
  editing,
  onDoneEditing,
}: {
  product: ProductDetail;
  editing: boolean;
  onDoneEditing: () => void;
}) {
  const router = useRouter();
  const version = product.currentVersion!;
  const tcsp = version.tcsp;
  const [materialCode, setMaterialCode] = useState(tcsp?.materialCode ?? "");
  const [description, setDescription] = useState(tcsp?.description ?? "");
  const [preparedBy, setPreparedBy] = useState(tcsp?.preparedBy ?? "");
  const [approvedBy, setApprovedBy] = useState(tcsp?.approvedBy ?? "");
  const [approvedAt, setApprovedAt] = useState(tcsp?.approvedAt ? tcsp.approvedAt.toISOString().slice(0, 10) : "");
  const [rows, setRows] = useState<SpecRow[]>(
    (tcsp?.specRows ?? []).map((r) => ({
      groupName: r.groupName,
      criterion: r.criterion,
      value: r.value,
      tolerance: r.tolerance ?? "",
      unit: r.unit ?? "",
      note: r.note ?? "",
      sortOrder: r.sortOrder,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addRow() {
    setRows([...rows, { groupName: "Kích thước", criterion: "", value: "", tolerance: "", unit: "", note: "", sortOrder: rows.length }]);
  }
  function removeRow(index: number) {
    setRows(rows.filter((_, i) => i !== index));
  }
  function updateRow(index: number, field: keyof SpecRow, value: string) {
    setRows(rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/products/${product.baseCode}/tcsp`, {
      method: "PATCH",
      body: JSON.stringify({
        materialCode: materialCode || null,
        description: description || null,
        preparedBy: preparedBy || null,
        approvedBy: approvedBy || null,
        approvedAt: approvedAt || null,
        specRows: rows.map((r, i) => ({ ...r, sortOrder: i })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Lưu thất bại — thử lại.");
      return;
    }
    onDoneEditing();
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="space-y-3 text-sm">
        <VersionBanner version={{ baseCode: product.baseCode, versionNumber: version.versionNumber, amisProductId: version.amisProductId, isCurrent: version.isCurrent }} />
        <p><strong>Mã NL:</strong> {tcsp?.materialCode || "—"}</p>
        <p><strong>Mô tả:</strong> {tcsp?.description || "—"}</p>
        <p><strong>Người lập:</strong> {tcsp?.preparedBy || "—"} · <strong>Người duyệt:</strong> {tcsp?.approvedBy || "—"} · <strong>Ngày duyệt:</strong> {tcsp?.approvedAt ? new Date(tcsp.approvedAt).toLocaleDateString("vi-VN") : "—"}</p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Nhóm</th><th className="p-2">Tiêu chí</th><th className="p-2">Thông số</th>
              <th className="p-2">D/sai</th><th className="p-2">Đơn vị</th><th className="p-2">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {(tcsp?.specRows ?? []).map((r) => (
              <tr key={r.id} className="border-b">
                <td className="p-2">{r.groupName}</td><td className="p-2">{r.criterion}</td><td className="p-2">{r.value}</td>
                <td className="p-2">{r.tolerance}</td><td className="p-2">{r.unit}</td><td className="p-2">{r.note}</td>
              </tr>
            ))}
            {(tcsp?.specRows ?? []).length === 0 && (
              <tr><td colSpan={6} className="p-2 text-gray-400">Chưa có dữ liệu</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <VersionBanner version={{ baseCode: product.baseCode, versionNumber: version.versionNumber, amisProductId: version.amisProductId, isCurrent: version.isCurrent }} />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Mã NL<input className="mt-1 w-full rounded border px-2 py-1" value={materialCode} onChange={(e) => setMaterialCode(e.target.value)} /></label>
        <label className="text-sm">Người lập<input className="mt-1 w-full rounded border px-2 py-1" value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} /></label>
      </div>
      <label className="block text-sm">Mô tả<textarea className="mt-1 w-full rounded border px-2 py-1" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Người duyệt<input className="mt-1 w-full rounded border px-2 py-1" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} /></label>
        <label className="text-sm">Ngày duyệt<input type="date" className="mt-1 w-full rounded border px-2 py-1" value={approvedAt} onChange={(e) => setApprovedAt(e.target.value)} /></label>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Nhóm</th><th className="p-2">Tiêu chí</th><th className="p-2">Thông số</th>
            <th className="p-2">D/sai</th><th className="p-2">Đơn vị</th><th className="p-2">Ghi chú</th><th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b">
              <td className="p-1">
                <select className="rounded border px-1 py-0.5" value={row.groupName} onChange={(e) => updateRow(i, "groupName", e.target.value)}>
                  <option value="Kích thước">Kích thước</option>
                  <option value="TC khác">TC khác</option>
                </select>
              </td>
              <td className="p-1"><input className="w-full rounded border px-1 py-0.5" value={row.criterion} onChange={(e) => updateRow(i, "criterion", e.target.value)} /></td>
              <td className="p-1"><input className="w-full rounded border px-1 py-0.5" value={row.value} onChange={(e) => updateRow(i, "value", e.target.value)} /></td>
              <td className="p-1"><input className="w-full rounded border px-1 py-0.5" value={row.tolerance} onChange={(e) => updateRow(i, "tolerance", e.target.value)} /></td>
              <td className="p-1"><input className="w-full rounded border px-1 py-0.5" value={row.unit} onChange={(e) => updateRow(i, "unit", e.target.value)} /></td>
              <td className="p-1"><input className="w-full rounded border px-1 py-0.5" value={row.note} onChange={(e) => updateRow(i, "note", e.target.value)} /></td>
              <td className="p-1"><button onClick={() => removeRow(i)} className="text-red-600">Xoá</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addRow} className="text-sm text-brand-600 hover:underline">+ Thêm dòng</button>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="rounded bg-brand-600 px-4 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Đang lưu..." : "Lưu"}
        </button>
        <button onClick={onDoneEditing} className="rounded border px-4 py-1.5 text-sm hover:bg-gray-50">Huỷ</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Wire `TCSPTab` into `ProductDetailTabs` — modify `apps/web/src/components/products/ProductDetailTabs.tsx`**

Add the import, replace the TCSP placeholder, and pass `editing`/`onDoneEditing` through:

```tsx
import { TCSPTab } from "./TCSPTab";
```

Replace:
```tsx
{activeTab === "Tiêu chuẩn sản phẩm" && <div data-testid="tab-tcsp">(TCSP — Task 2)</div>}
```
with:
```tsx
{activeTab === "Tiêu chuẩn sản phẩm" && (
  <TCSPTab product={product} editing={editing && activeTab === "Tiêu chuẩn sản phẩm"} onDoneEditing={() => setEditing(false)} />
)}
```

- [ ] **Step 11: Run the full test suite and manually verify**

Run: `npm run test --workspace=apps/web` — expect all prior tests plus these new ones to pass.
Then `npm run dev`, log in as `admin`, open a real product's detail page, click "Chỉnh sửa" on TCSP, fill in a couple of fields and a spec row, save — confirm the view mode now shows the saved data.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/lib/products/change-log.ts apps/web/src/lib/products/change-log.test.ts apps/web/src/components/products/TCSPTab.tsx apps/web/src/app/api/products/\[baseCode\]/tcsp apps/web/src/components/products/ProductDetailTabs.tsx
git commit -m "feat(web): TCSP tab (view + edit) with shared change-log helper"
```

---

### Task 3: QC tab (view + edit)

**Files:**
- Create: `apps/web/src/components/products/QCTab.tsx`
- Create: `apps/web/src/app/api/products/[baseCode]/qc/route.ts`
- Create: `apps/web/src/app/api/products/[baseCode]/qc/route.test.ts`
- Modify: `apps/web/src/components/products/ProductDetailTabs.tsx`

**Interfaces:**
- Consumes: `diffFields`, `recordChanges` (Task 2's `change-log.ts`, unchanged); `VersionBanner` (Task 1).
- Produces: `<QCTab product={ProductDetail} editing={boolean} onDoneEditing={() => void} />`.

- [ ] **Step 1: Write the failing test for the QC PATCH route**

Same structure as Task 2's `tcsp/route.test.ts` — a fresh test product/version, 403 for QC_STAFF, MANAGER save succeeds and writes a ChangeLogEntry:

```ts
// apps/web/src/app/api/products/[baseCode]/qc/route.test.ts
import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma, UserRole } from "@qc/db";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
import { PATCH } from "./route";

function mockSession(role: UserRole | null) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    role ? { user: { id: "u1", username: "test", fullName: "Test", role } } : null
  );
}

const baseCode = `QCRT${Date.now()}`;
let versionId: string;

describe("/api/products/[baseCode]/qc", () => {
  beforeAll(async () => {
    const product = await prisma.product.create({ data: { baseCode, amisProductId: `amis-${baseCode}`, status: "PENDING_QC" } });
    const version = await prisma.productVersion.create({
      data: { productId: product.id, versionNumber: 1, amisProductId: `amis-v-${baseCode}`, name: "Test", isCurrent: true },
    });
    await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: version.id } });
    versionId = version.id;
  });

  beforeEach(() => vi.clearAllMocks());

  it("trả 403 khi là QC_STAFF", async () => {
    mockSession(UserRole.QC_STAFF);
    const req = new Request(`http://localhost/api/products/${baseCode}/qc`, {
      method: "PATCH",
      body: JSON.stringify({ checklist: "x" }),
    });
    const res = await PATCH(req, { params: { baseCode } });
    expect(res.status).toBe(403);
  });

  it("MANAGER lưu được và ghi ChangeLogEntry", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/qc`, {
      method: "PATCH",
      body: JSON.stringify({ checklist: "Kiểm tra độ dày", knownDefects: null, specialNotes: null }),
    });
    const res = await PATCH(req, { params: { baseCode } });
    expect(res.status).toBe(200);

    const qc = await prisma.qCData.findUnique({ where: { versionId } });
    expect(qc?.checklist).toBe("Kiểm tra độ dày");

    const logs = await prisma.changeLogEntry.findMany({ where: { versionId } });
    expect(logs.some((l) => l.fieldPath === "checklist")).toBe(true);
  });

  afterAll(async () => {
    await prisma.qCData.deleteMany({ where: { versionId } });
    await prisma.changeLogEntry.deleteMany({ where: { versionId } });
    await prisma.productVersion.deleteMany({ where: { id: versionId } });
    await prisma.product.deleteMany({ where: { baseCode } });
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/web`
Expected: FAIL — `./route` doesn't exist.

- [ ] **Step 3: Write `apps/web/src/app/api/products/[baseCode]/qc/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";
import { diffFields, recordChanges } from "@/lib/products/change-log";

const qcSchema = z.object({
  checklist: z.string().nullable().optional(),
  knownDefects: z.string().nullable().optional(),
  specialNotes: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { baseCode: string } }) {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.MANAGER, UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const product = await prisma.product.findUnique({ where: { baseCode: params.baseCode } });
  if (!product || !product.currentVersionId) {
    return NextResponse.json({ error: "Không tìm thấy mã hàng" }, { status: 404 });
  }

  const parsed = qcSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const versionId = product.currentVersionId;
  const existing = await prisma.qCData.findUnique({ where: { versionId } });

  const next = {
    checklist: parsed.data.checklist ?? null,
    knownDefects: parsed.data.knownDefects ?? null,
    specialNotes: parsed.data.specialNotes ?? null,
  };
  const prev = existing ? { checklist: existing.checklist, knownDefects: existing.knownDefects, specialNotes: existing.specialNotes } : null;
  const changes = diffFields(prev, next);

  await prisma.qCData.upsert({ where: { versionId }, update: next, create: { versionId, ...next } });
  await recordChanges(versionId, session!.user.id, changes);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/web`
Expected: PASS (2 tests)

- [ ] **Step 5: Write `apps/web/src/components/products/QCTab.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VersionBanner } from "./VersionBanner";
import type { ProductDetail } from "@/lib/products/get-product-detail";

export function QCTab({
  product,
  editing,
  onDoneEditing,
}: {
  product: ProductDetail;
  editing: boolean;
  onDoneEditing: () => void;
}) {
  const router = useRouter();
  const version = product.currentVersion!;
  const qc = version.qc;
  const [checklist, setChecklist] = useState(qc?.checklist ?? "");
  const [knownDefects, setKnownDefects] = useState(qc?.knownDefects ?? "");
  const [specialNotes, setSpecialNotes] = useState(qc?.specialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/products/${product.baseCode}/qc`, {
      method: "PATCH",
      body: JSON.stringify({ checklist: checklist || null, knownDefects: knownDefects || null, specialNotes: specialNotes || null }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Lưu thất bại — thử lại.");
      return;
    }
    onDoneEditing();
    router.refresh();
  }

  const bannerVersion = { baseCode: product.baseCode, versionNumber: version.versionNumber, amisProductId: version.amisProductId, isCurrent: version.isCurrent };

  if (!editing) {
    return (
      <div className="space-y-3 text-sm">
        <VersionBanner version={bannerVersion} />
        <div><strong>Các mục cần QC:</strong><p className="whitespace-pre-wrap">{qc?.checklist || "Chưa có dữ liệu"}</p></div>
        <div><strong>Lỗi đã từng gặp:</strong><p className="whitespace-pre-wrap">{qc?.knownDefects || "Chưa có dữ liệu"}</p></div>
        <div><strong>Lưu ý đặc biệt:</strong><p className="whitespace-pre-wrap">{qc?.specialNotes || "Chưa có dữ liệu"}</p></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <VersionBanner version={bannerVersion} />
      <label className="block text-sm">Các mục cần QC<textarea rows={4} className="mt-1 w-full rounded border px-2 py-1" value={checklist} onChange={(e) => setChecklist(e.target.value)} /></label>
      <label className="block text-sm">Lỗi đã từng gặp<textarea rows={4} className="mt-1 w-full rounded border px-2 py-1" value={knownDefects} onChange={(e) => setKnownDefects(e.target.value)} /></label>
      <label className="block text-sm">Lưu ý đặc biệt<textarea rows={4} className="mt-1 w-full rounded border px-2 py-1" value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} /></label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="rounded bg-brand-600 px-4 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Đang lưu..." : "Lưu"}
        </button>
        <button onClick={onDoneEditing} className="rounded border px-4 py-1.5 text-sm hover:bg-gray-50">Huỷ</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire into `ProductDetailTabs` — modify `apps/web/src/components/products/ProductDetailTabs.tsx`**

```tsx
import { QCTab } from "./QCTab";
```
Replace:
```tsx
{activeTab === "QC sản phẩm" && <div data-testid="tab-qc">(QC — Task 3)</div>}
```
with:
```tsx
{activeTab === "QC sản phẩm" && (
  <QCTab product={product} editing={editing && activeTab === "QC sản phẩm"} onDoneEditing={() => setEditing(false)} />
)}
```

- [ ] **Step 7: Run full suite and manually verify**

Run: `npm run test --workspace=apps/web`. Then in the browser, switch to the QC tab, edit and save, confirm it persists.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/products/QCTab.tsx apps/web/src/app/api/products/\[baseCode\]/qc apps/web/src/components/products/ProductDetailTabs.tsx
git commit -m "feat(web): QC tab (view + edit)"
```

---

### Task 4: Packaging tab (view + edit)

**Files:**
- Create: `apps/web/src/components/products/PackagingTab.tsx`
- Create: `apps/web/src/app/api/products/[baseCode]/packaging/route.ts`
- Create: `apps/web/src/app/api/products/[baseCode]/packaging/route.test.ts`
- Modify: `apps/web/src/components/products/ProductDetailTabs.tsx`

**Interfaces:**
- Consumes: `diffFields`, `recordChanges` (Task 2); `VersionBanner` (Task 1).
- Produces: `<PackagingTab product={ProductDetail} editing={boolean} onDoneEditing={() => void} />`.

This task is structurally identical to Task 3 (QC tab), targeting `PackagingData` (`instructions`, `specialNotes`) instead of `QCData`. Follow the exact same steps.

- [ ] **Step 1: Write the failing test for the Packaging PATCH route**

```ts
// apps/web/src/app/api/products/[baseCode]/packaging/route.test.ts
import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma, UserRole } from "@qc/db";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
import { PATCH } from "./route";

function mockSession(role: UserRole | null) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    role ? { user: { id: "u1", username: "test", fullName: "Test", role } } : null
  );
}

const baseCode = `PKGRT${Date.now()}`;
let versionId: string;

describe("/api/products/[baseCode]/packaging", () => {
  beforeAll(async () => {
    const product = await prisma.product.create({ data: { baseCode, amisProductId: `amis-${baseCode}`, status: "PENDING_QC" } });
    const version = await prisma.productVersion.create({
      data: { productId: product.id, versionNumber: 1, amisProductId: `amis-v-${baseCode}`, name: "Test", isCurrent: true },
    });
    await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: version.id } });
    versionId = version.id;
  });

  beforeEach(() => vi.clearAllMocks());

  it("trả 403 khi là QC_STAFF", async () => {
    mockSession(UserRole.QC_STAFF);
    const req = new Request(`http://localhost/api/products/${baseCode}/packaging`, {
      method: "PATCH",
      body: JSON.stringify({ instructions: "x" }),
    });
    const res = await PATCH(req, { params: { baseCode } });
    expect(res.status).toBe(403);
  });

  it("MANAGER lưu được và ghi ChangeLogEntry", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/packaging`, {
      method: "PATCH",
      body: JSON.stringify({ instructions: "Đóng gói bọc túi", specialNotes: null }),
    });
    const res = await PATCH(req, { params: { baseCode } });
    expect(res.status).toBe(200);

    const packaging = await prisma.packagingData.findUnique({ where: { versionId } });
    expect(packaging?.instructions).toBe("Đóng gói bọc túi");

    const logs = await prisma.changeLogEntry.findMany({ where: { versionId } });
    expect(logs.some((l) => l.fieldPath === "instructions")).toBe(true);
  });

  afterAll(async () => {
    await prisma.packagingData.deleteMany({ where: { versionId } });
    await prisma.changeLogEntry.deleteMany({ where: { versionId } });
    await prisma.productVersion.deleteMany({ where: { id: versionId } });
    await prisma.product.deleteMany({ where: { baseCode } });
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/web`
Expected: FAIL.

- [ ] **Step 3: Write `apps/web/src/app/api/products/[baseCode]/packaging/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";
import { diffFields, recordChanges } from "@/lib/products/change-log";

const packagingSchema = z.object({
  instructions: z.string().nullable().optional(),
  specialNotes: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { baseCode: string } }) {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.MANAGER, UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const product = await prisma.product.findUnique({ where: { baseCode: params.baseCode } });
  if (!product || !product.currentVersionId) {
    return NextResponse.json({ error: "Không tìm thấy mã hàng" }, { status: 404 });
  }

  const parsed = packagingSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const versionId = product.currentVersionId;
  const existing = await prisma.packagingData.findUnique({ where: { versionId } });

  const next = { instructions: parsed.data.instructions ?? null, specialNotes: parsed.data.specialNotes ?? null };
  const prev = existing ? { instructions: existing.instructions, specialNotes: existing.specialNotes } : null;
  const changes = diffFields(prev, next);

  await prisma.packagingData.upsert({ where: { versionId }, update: next, create: { versionId, ...next } });
  await recordChanges(versionId, session!.user.id, changes);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/web`
Expected: PASS (2 tests)

- [ ] **Step 5: Write `apps/web/src/components/products/PackagingTab.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VersionBanner } from "./VersionBanner";
import type { ProductDetail } from "@/lib/products/get-product-detail";

export function PackagingTab({
  product,
  editing,
  onDoneEditing,
}: {
  product: ProductDetail;
  editing: boolean;
  onDoneEditing: () => void;
}) {
  const router = useRouter();
  const version = product.currentVersion!;
  const packaging = version.packaging;
  const [instructions, setInstructions] = useState(packaging?.instructions ?? "");
  const [specialNotes, setSpecialNotes] = useState(packaging?.specialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/products/${product.baseCode}/packaging`, {
      method: "PATCH",
      body: JSON.stringify({ instructions: instructions || null, specialNotes: specialNotes || null }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Lưu thất bại — thử lại.");
      return;
    }
    onDoneEditing();
    router.refresh();
  }

  const bannerVersion = { baseCode: product.baseCode, versionNumber: version.versionNumber, amisProductId: version.amisProductId, isCurrent: version.isCurrent };

  if (!editing) {
    return (
      <div className="space-y-3 text-sm">
        <VersionBanner version={bannerVersion} />
        <div><strong>Hướng dẫn đóng gói:</strong><p className="whitespace-pre-wrap">{packaging?.instructions || "Chưa có dữ liệu"}</p></div>
        <div><strong>Lưu ý đóng gói:</strong><p className="whitespace-pre-wrap">{packaging?.specialNotes || "Chưa có dữ liệu"}</p></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <VersionBanner version={bannerVersion} />
      <label className="block text-sm">Hướng dẫn đóng gói<textarea rows={5} className="mt-1 w-full rounded border px-2 py-1" value={instructions} onChange={(e) => setInstructions(e.target.value)} /></label>
      <label className="block text-sm">Lưu ý đóng gói, tem nhãn dán thùng<textarea rows={5} className="mt-1 w-full rounded border px-2 py-1" value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} /></label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="rounded bg-brand-600 px-4 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Đang lưu..." : "Lưu"}
        </button>
        <button onClick={onDoneEditing} className="rounded border px-4 py-1.5 text-sm hover:bg-gray-50">Huỷ</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire into `ProductDetailTabs`**

```tsx
import { PackagingTab } from "./PackagingTab";
```
Replace:
```tsx
{activeTab === "Quy cách đóng gói" && <div data-testid="tab-packaging">(Đóng gói — Task 4)</div>}
```
with:
```tsx
{activeTab === "Quy cách đóng gói" && (
  <PackagingTab product={product} editing={editing && activeTab === "Quy cách đóng gói"} onDoneEditing={() => setEditing(false)} />
)}
```

- [ ] **Step 7: Run full suite and manually verify**

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/products/PackagingTab.tsx apps/web/src/app/api/products/\[baseCode\]/packaging apps/web/src/components/products/ProductDetailTabs.tsx
git commit -m "feat(web): Packaging tab (view + edit)"
```

---

### Task 5: Documents tab (read-only empty-state shell)

**Files:**
- Create: `apps/web/src/components/products/DocumentsTab.tsx`
- Modify: `apps/web/src/components/products/ProductDetailTabs.tsx`

**Interfaces:**
- Produces: `<DocumentsTab product={ProductDetail} />` — no `editing`/`onDoneEditing` props, since there's nothing to edit yet in this plan (no upload UI until Plan 3b).

No PATCH route in this task — `DocumentsData`/`ProductDocument` have nothing editable without file upload, which is explicitly out of scope for Plan 3a per spec §7.

- [ ] **Step 1: Write `apps/web/src/components/products/DocumentsTab.tsx`**

```tsx
import { VersionBanner } from "./VersionBanner";
import type { ProductDetail } from "@/lib/products/get-product-detail";

const KIND_LABELS: Record<string, string> = { COA: "COA", MSDS: "MSDS", ROHS: "Test ROHS", OTHER: "Khác" };

export function DocumentsTab({ product }: { product: ProductDetail }) {
  const version = product.currentVersion!;
  const files = version.documents?.files ?? [];
  const bannerVersion = { baseCode: product.baseCode, versionNumber: version.versionNumber, amisProductId: version.amisProductId, isCurrent: version.isCurrent };

  return (
    <div className="space-y-3 text-sm">
      <VersionBanner version={bannerVersion} />
      {files.length === 0 ? (
        <p className="text-gray-400">Chưa có tài liệu nào — chức năng tải lên sẽ có ở phiên bản sau.</p>
      ) : (
        <ul className="divide-y rounded border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between p-2">
              <span>{KIND_LABELS[f.kind] ?? f.kind} — {f.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into `ProductDetailTabs`**

```tsx
import { DocumentsTab } from "./DocumentsTab";
```
Replace:
```tsx
{activeTab === "Giấy tờ sản phẩm" && <div data-testid="tab-documents">(Giấy tờ — Task 5)</div>}
```
with:
```tsx
{activeTab === "Giấy tờ sản phẩm" && <DocumentsTab product={product} />}
```

Also remove `"Giấy tờ sản phẩm"` from the `editableTabs` array (it was never in there — confirm it stays absent) so the "Chỉnh sửa" button never appears on this tab, matching this task producing no edit capability.

- [ ] **Step 3: Run the full test suite**

Run: `npm run test --workspace=apps/web` — expect all prior tests to still pass (no new automated test for this task; it has no branching logic worth testing beyond what `ProductDetailTabs.test.tsx` in Task 1 already covers by asserting no "Chỉnh sửa" button appears on this tab's neighbors — a quick manual check is sufficient here).

- [ ] **Step 4: Manual verification**

Open the Documents tab in the browser — confirm it shows the "chưa có tài liệu" empty state and no edit button.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/products/DocumentsTab.tsx apps/web/src/components/products/ProductDetailTabs.tsx
git commit -m "feat(web): Documents tab (read-only shell, upload comes in Plan 3b)"
```

---

### Task 6: History tab (version list + change log)

**Files:**
- Create: `apps/web/src/components/products/HistoryTab.tsx`
- Modify: `apps/web/src/components/products/ProductDetailTabs.tsx`

**Interfaces:**
- Produces: `<HistoryTab product={ProductDetail} />` — reads `product.versions` (already fetched with nested `changeLogs` by Task 1's `getProductDetail`).

- [ ] **Step 1: Write `apps/web/src/components/products/HistoryTab.tsx`**

```tsx
import Link from "next/link";
import type { ProductDetail } from "@/lib/products/get-product-detail";

const SOURCE_LABELS: Record<string, string> = { AMIS_SYNC: "Đồng bộ AMIS", MANUAL: "Chỉnh sửa thủ công" };

export function HistoryTab({ product }: { product: ProductDetail }) {
  return (
    <div className="space-y-4 text-sm">
      {product.versions.map((v) => (
        <div key={v.id} className="rounded border p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {product.baseCode}.{v.versionNumber} {v.isCurrent && <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">Hiện hành</span>}
            </span>
            {!v.isCurrent && (
              <Link href={`/products/${product.baseCode}/v/${v.versionNumber}`} className="text-brand-600 hover:underline">
                Xem phiên bản này
              </Link>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Tạo lúc {new Date(v.createdAt).toLocaleString("vi-VN")} — {v.createdByAmisSync ? "từ đồng bộ AMIS" : "thủ công"}
          </p>
          {v.changeLogs.length > 0 && (
            <ul className="mt-2 space-y-1 border-t pt-2">
              {v.changeLogs.map((log) => (
                <li key={log.id} className="text-xs text-gray-600">
                  <span className="font-medium">{log.fieldPath}</span>: {log.oldValue ?? "(trống)"} → {log.newValue ?? "(trống)"}
                  {" · "}
                  {SOURCE_LABELS[log.source] ?? log.source}
                  {" · "}
                  {new Date(log.changedAt).toLocaleString("vi-VN")}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire into `ProductDetailTabs`**

```tsx
import { HistoryTab } from "./HistoryTab";
```
Replace:
```tsx
{activeTab === "Lịch sử phiên bản" && <div data-testid="tab-history">(Lịch sử — Task 6)</div>}
```
with:
```tsx
{activeTab === "Lịch sử phiên bản" && <HistoryTab product={product} />}
```

- [ ] **Step 3: Run the full test suite**

Run: `npm run test --workspace=apps/web` — all tests, including Task 1's "chuyển sang tab Lịch sử phiên bản thì không còn nút Chỉnh sửa" test, should still pass now that this tab renders real content instead of a placeholder.

- [ ] **Step 4: Manual verification**

Open a product that has both AMIS-sync history and at least one manual edit (from Tasks 2-4's manual verification) — confirm the History tab shows both, with the right source labels.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/products/HistoryTab.tsx apps/web/src/components/products/ProductDetailTabs.tsx
git commit -m "feat(web): version history tab"
```

---

### Task 7: Read-only old-version view

**Files:**
- Create: `apps/web/src/app/(dashboard)/products/[baseCode]/v/[versionNumber]/page.tsx`

**Interfaces:**
- Consumes: `getProductDetail` (Task 1) — reused as-is; this page just picks a different version out of `product.versions` instead of `product.currentVersion`.

- [ ] **Step 1: Write `apps/web/src/app/(dashboard)/products/[baseCode]/v/[versionNumber]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getProductDetail } from "@/lib/products/get-product-detail";
import { VersionBanner } from "@/components/products/VersionBanner";

export default async function ProductOldVersionPage({
  params,
}: {
  params: { baseCode: string; versionNumber: string };
}) {
  const product = await getProductDetail(params.baseCode);
  if (!product) notFound();

  const versionNumber = Number(params.versionNumber);
  const version = product.versions.find((v) => v.versionNumber === versionNumber);
  if (!version) notFound();

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">
        {product.baseCode}.{version.versionNumber} — {version.name}
      </h1>
      <p className="mb-4 text-sm text-gray-500">Xem lại phiên bản cũ — không sửa được.</p>
      <VersionBanner
        version={{ baseCode: product.baseCode, versionNumber: version.versionNumber, amisProductId: version.amisProductId, isCurrent: version.isCurrent }}
      />
      <div className="mt-4 space-y-4 text-sm">
        <section>
          <h2 className="font-medium">Tiêu chuẩn sản phẩm</h2>
          <p>{version.tcsp?.description || "Chưa có dữ liệu"}</p>
        </section>
        <section>
          <h2 className="font-medium">QC sản phẩm</h2>
          <p className="whitespace-pre-wrap">{version.qc?.checklist || "Chưa có dữ liệu"}</p>
        </section>
        <section>
          <h2 className="font-medium">Quy cách đóng gói</h2>
          <p className="whitespace-pre-wrap">{version.packaging?.instructions || "Chưa có dữ liệu"}</p>
        </section>
      </div>
    </div>
  );
}
```

Note: `product.versions` (from `getProductDetail`) doesn't include nested `tcsp`/`qc`/`packaging` for non-current versions — only `currentVersion` does (see Task 1's query). Before writing this page, extend `getProductDetail`'s `versions` include to also fetch `tcsp`, `qc`, `packaging` (not `documents`, since Plan 3a has nothing to show there yet) — add this to `apps/web/src/lib/products/get-product-detail.ts`'s `versions.include` block:

```ts
versions: {
  orderBy: { versionNumber: "desc" },
  include: {
    changeLogs: { orderBy: { changedAt: "desc" } },
    tcsp: true,
    qc: true,
    packaging: true,
  },
},
```

- [ ] **Step 2: Update `get-product-detail.ts` per the note above, then run the full test suite**

Run: `npm run test --workspace=apps/web` — the `ProductDetailTabs.test.tsx` fixture's `versions: []` still satisfies the (now slightly wider) type; confirm nothing broke.

- [ ] **Step 3: Manual verification**

If any synced product has more than one version (check via Prisma Studio, or use one you created a version for during earlier testing), open `/products/<baseCode>/v/<olderVersionNumber>` and confirm it shows that version's content read-only, with the "PHIÊN BẢN CŨ, CHỈ ĐỌC" banner. If no multi-version product is available in the current dev data, this is acceptable to verify by reading the code path carefully instead — note this in your report.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/products/\[baseCode\]/v apps/web/src/lib/products/get-product-detail.ts
git commit -m "feat(web): read-only old-version page"
```
