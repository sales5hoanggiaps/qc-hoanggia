# Phát hiện trôi tên phiên bản (needsInheritanceReview) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khi worker sync tạo 1 `ProductVersion` mới mà tên AMIS trôi quá xa so với phiên bản hiện hành, đánh dấu bản mới đó "cần xác nhận kế thừa" và hiện cảnh báo cho MANAGER/ADMIN trong tab Lịch sử phiên bản — giải quyết hard gate ở spec §12.

**Architecture:** Thêm 1 cột boolean `needsInheritanceReview` trên `ProductVersion`. Hàm thuần `detectNameDrift` (Jaccard word-overlap) trong `version-detection.ts` được gọi từ `upsertProductFromAmis` mỗi khi tạo `ProductVersion` mới qua nhánh `.N`; nếu trôi, set cờ + ghi `ChangeLogEntry` (đã tự hiện trong `HistoryTab` vì UI đó lặp `changeLogs` chung). MANAGER/ADMIN xác nhận qua 1 route PATCH mới, xoá cờ + ghi log xác nhận. Không có bảng mới, không có trang mới.

**Tech Stack:** TypeScript, Next.js API routes, Prisma/PostgreSQL, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-09-qc-hoanggia-design.md` §12.1

## Global Constraints

- Ngưỡng phát hiện trôi: `NAME_DRIFT_THRESHOLD = 0.3` (Jaccard similarity dưới ngưỡng này = trôi).
- Ceiling đã biết và CHẤP NHẬN (không cần fix trong plan này): kiểu trôi `SI08201` (khuôn câu chung + đổi tên khách hàng cuối câu) không bị heuristic word-overlap bắt chắc chắn.
- Cờ `needsInheritanceReview` chỉ là cảnh báo — KHÔNG chặn xem QC/TCSP, KHÔNG chặn xuất Excel TCSP.
- Không thêm trang admin mới, không sửa `SyncPanel`/`SyncLog`.

---

### Task 1: Migration — thêm cột `ProductVersion.needsInheritanceReview`

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (model `ProductVersion`)
- Create: `packages/db/prisma/migrations/<timestamp>_add_needs_inheritance_review_to_product_version/migration.sql` (sinh tự động bởi lệnh ở Step 1, không tự viết tay)

**Interfaces:**
- Produces: `ProductVersion.needsInheritanceReview: boolean` (default `false`), có mặt trên mọi `ProductVersion` hiện có sau migration, dùng bởi Task 3 (worker set giá trị), Task 4 (route đọc/xoá), Task 5 (UI đọc).

- [ ] **Step 1: Thêm field vào schema, sinh migration**

Mở `packages/db/prisma/schema.prisma`, tìm model `ProductVersion` (dòng ~83-103), thêm 1 dòng field mới ngay dưới `createdByAmisSync`:

```prisma
model ProductVersion {
  id                String   @id @default(cuid())
  productId         String
  product           Product  @relation("AllVersions", fields: [productId], references: [id])
  currentForProduct Product? @relation("CurrentVersion")
  versionNumber     Int
  amisProductId     String   @unique
  name              String
  description       String?
  isCurrent         Boolean  @default(true)
  createdByAmisSync Boolean  @default(true)
  /// Đánh dấu bởi worker sync khi tên AMIS trôi lớn so với phiên bản hiện
  /// hành lúc tạo (xem detectNameDrift, spec §12.1) — nội dung TCSP/QC/
  /// Packaging/Documents vẫn được kế thừa như bình thường, nhưng
  /// MANAGER/ADMIN cần xác nhận đã kiểm tra trước khi coi là đáng tin.
  needsInheritanceReview Boolean @default(false)
  createdAt         DateTime @default(now())

  tcsp       TCSPData?
  qc         QCData?
  packaging  PackagingData?
  documents  DocumentsData?
  changeLogs ChangeLogEntry[]

  @@unique([productId, versionNumber])
}
```

Chạy (cần Postgres đang chạy, xem `infra/docker-compose.yml` nếu chưa bật):

```bash
npm run migrate:dev --workspace=packages/db -- --name add_needs_inheritance_review_to_product_version
```

Lệnh này tự sinh file `migration.sql` trong 1 thư mục timestamp mới dưới `packages/db/prisma/migrations/` (nội dung mong đợi: `ALTER TABLE "ProductVersion" ADD COLUMN "needsInheritanceReview" BOOLEAN NOT NULL DEFAULT false;`) và áp dụng vào DB dev, đồng thời tự chạy `prisma generate` để cập nhật Prisma Client types.

- [ ] **Step 2: Regression — xác nhận không phá vỡ gì hiện có**

Cột mới có default `false`, chưa code nào dùng tới — chạy toàn bộ test suite hiện có để xác nhận migration không phá dữ liệu/type cũ:

Run: `npm test`
Expected: PASS toàn bộ (không có test nào assert số cột của `ProductVersion`, migration cộng thêm cột không ảnh hưởng).

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(db): add ProductVersion.needsInheritanceReview column"
```

---

### Task 2: `detectNameDrift` — heuristic Jaccard word-overlap

**Files:**
- Modify: `apps/worker/src/sync/version-detection.ts`
- Test: `apps/worker/src/sync/version-detection.test.ts`

**Interfaces:**
- Produces: `export const NAME_DRIFT_THRESHOLD: number`, `export function detectNameDrift(oldName: string, newName: string): boolean` — dùng bởi Task 3.

- [ ] **Step 1: Viết test thất bại (dùng đúng ví dụ thật ở spec §12)**

Sửa dòng import ở đầu `apps/worker/src/sync/version-detection.test.ts` (dòng 2) từ:

```typescript
import { parseVersionSuffix } from "./version-detection";
```

thành:

```typescript
import { parseVersionSuffix, detectNameDrift } from "./version-detection";
```

Rồi thêm describe block mới vào CUỐI file (giữ nguyên describe `parseVersionSuffix` hiện có):

```typescript
describe("detectNameDrift", () => {
  it("phát hiện trôi khi tên đổi hẳn sang mặt hàng khác (SI06877/SI06878 — spec §12)", () => {
    expect(detectNameDrift("Nhãn SH.C3/SH.C5 phủ bóng", "Nhãn Bình khí CO2 3kg/5kg")).toBe(true);
  });

  it("phát hiện trôi khi tên đổi hẳn sang khách hàng/sản phẩm khác (SI00035 — spec §12)", () => {
    expect(detectNameDrift("Nhãn lọ Avinora bọt tắm gội cho bé", "Tem giấy cán bóng Nước muối Sao Mai 500ml")).toBe(true);
  });

  it("phát hiện trôi khi tên đổi hẳn sang model sản phẩm khác (AA03979 — spec §12)", () => {
    expect(detectNameDrift("Tờ hướng dẫn sử dụng sản phẩm SA310P", "Tờ HDSD QTT400X-PN")).toBe(true);
  });

  it("KHÔNG coi là trôi khi chỉ đổi cách gọi 'Nhãn'→'Tem' hoặc đổi số lô (AA0111735/SI04914 — spec §12)", () => {
    expect(
      detectNameDrift(
        "Nhãn (trung gian) ống nghiệm lấy máu Clot Activator 2ml lô 1",
        "Tem (trung gian) ống nghiệm lấy máu Clot Activator 2ml lô 2"
      )
    ).toBe(false);
  });

  it("KHÔNG coi là trôi khi tên giống hệt nhau", () => {
    expect(detectNameDrift("Nhãn sản phẩm ABC", "Nhãn sản phẩm ABC")).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npm run test --workspace=apps/worker -- src/sync/version-detection.test.ts`
Expected: FAIL với lỗi `detectNameDrift is not a function` hoặc lỗi import (chưa export).

- [ ] **Step 3: Viết implementation tối thiểu**

Thêm vào cuối `apps/worker/src/sync/version-detection.ts` (giữ nguyên `VERSION_SUFFIX_RE`/`parseVersionSuffix` hiện có ở trên):

```typescript
/**
 * Ngưỡng độ tương tự Jaccard (giao/hợp trên tập token đã chuẩn hoá) — dưới ngưỡng này coi là "trôi tên
 * lớn" (xem spec §12.1). Chọn 0.3 dựa trên các ví dụ thật đã ghi nhận ở spec §12: 4/5 ca trôi lớn đã
 * biết (SI06877/SI06878, SI00035, AA03979) rơi dưới 0.1; các ca chỉ đổi lô/cách gọi rơi trên 0.7.
 *
 * Ceiling đã biết (ghi trong spec §12.1): kiểu trôi như SI08201 (khuôn câu chung, chỉ đổi tên khách
 * hàng ở cuối câu) giữ độ tương tự CAO vì phần khuôn câu chung chiếm đa số token — heuristic này KHÔNG
 * bắt chắc chắn được kiểu đó. Chấp nhận, không xử lý trong phạm vi này.
 */
export const NAME_DRIFT_THRESHOLD = 0.3;

function tokenize(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 0)
  );
}

export function detectNameDrift(oldName: string, newName: string): boolean {
  const oldTokens = tokenize(oldName);
  const newTokens = tokenize(newName);
  if (oldTokens.size === 0 || newTokens.size === 0) return false;

  let intersectionSize = 0;
  for (const token of oldTokens) {
    if (newTokens.has(token)) intersectionSize++;
  }
  const unionSize = new Set([...oldTokens, ...newTokens]).size;

  return intersectionSize / unionSize < NAME_DRIFT_THRESHOLD;
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npm run test --workspace=apps/worker -- src/sync/version-detection.test.ts`
Expected: PASS toàn bộ (cả test cũ của `parseVersionSuffix` lẫn test mới).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/sync/version-detection.ts apps/worker/src/sync/version-detection.test.ts
git commit -m "feat(worker): add detectNameDrift heuristic for version name drift"
```

---

### Task 3: Tích hợp vào `upsertProductFromAmis` — set cờ + ghi ChangeLogEntry

**Files:**
- Modify: `apps/worker/src/sync/upsert-product.ts`
- Test: `apps/worker/src/sync/upsert-product.test.ts`

**Interfaces:**
- Consumes: `detectNameDrift(oldName: string, newName: string): boolean` (Task 2), `ProductVersion.needsInheritanceReview` (Task 1).
- Produces: `ProductVersion` mới tạo trong nhánh `.N` có `needsInheritanceReview` set đúng; nếu `true`, kèm 1 `ChangeLogEntry` (`fieldPath: "nameDrift"`) — dùng bởi Task 4 (route xoá cờ) và Task 5 (UI đọc cả 2).

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `describe("upsertProductFromAmis", ...)` trong `apps/worker/src/sync/upsert-product.test.ts` (trước dấu `});` đóng describe cuối file, sau test "kế thừa media..."):

```typescript
  it("tên trôi lớn so với phiên bản hiện hành — ProductVersion mới bị gắn cờ needsInheritanceReview + ghi ChangeLogEntry nameDrift", async () => {
    const baseAmisId = `amis-${testBaseCode}-drift-v1`;
    const versionBaseCode = `ZR${String(Date.now()).slice(-6)}`;

    await upsertProductFromAmis({
      amisProductId: baseAmisId,
      code: `${versionBaseCode}.1`,
      name: "Nhãn lọ Avinora bọt tắm gội cho bé",
      description: null,
    });

    const result = await upsertProductFromAmis({
      amisProductId: `${baseAmisId}-2`,
      code: `${versionBaseCode}.2`,
      name: "Tem giấy cán bóng Nước muối Sao Mai 500ml",
      description: null,
    });
    expect(result.kind).toBe("new_version");

    const product = await prisma.product.findUnique({
      where: { baseCode: versionBaseCode },
      include: { currentVersion: { include: { changeLogs: true } } },
    });
    expect(product?.currentVersion?.versionNumber).toBe(2);
    expect(product?.currentVersion?.needsInheritanceReview).toBe(true);
    const driftLog = product?.currentVersion?.changeLogs.find((l) => l.fieldPath === "nameDrift");
    expect(driftLog?.oldValue).toBe("Nhãn lọ Avinora bọt tắm gội cho bé");
    expect(driftLog?.newValue).toBe("Tem giấy cán bóng Nước muối Sao Mai 500ml");
    expect(driftLog?.source).toBe("AMIS_SYNC");
  });

  it("tên KHÔNG trôi (chỉ đổi lô) — ProductVersion mới KHÔNG bị gắn cờ, không có ChangeLogEntry nameDrift", async () => {
    const baseAmisId = `amis-${testBaseCode}-nodrift-v1`;
    const versionBaseCode = `ZQ${String(Date.now()).slice(-6)}`;

    await upsertProductFromAmis({
      amisProductId: baseAmisId,
      code: `${versionBaseCode}.1`,
      name: "Nhãn ống nghiệm lấy máu Clot Activator 2ml lô 1",
      description: null,
    });

    await upsertProductFromAmis({
      amisProductId: `${baseAmisId}-2`,
      code: `${versionBaseCode}.2`,
      name: "Tem ống nghiệm lấy máu Clot Activator 2ml lô 2",
      description: null,
    });

    const product = await prisma.product.findUnique({
      where: { baseCode: versionBaseCode },
      include: { currentVersion: { include: { changeLogs: true } } },
    });
    expect(product?.currentVersion?.needsInheritanceReview).toBe(false);
    expect(product?.currentVersion?.changeLogs.some((l) => l.fieldPath === "nameDrift")).toBe(false);
  });
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npm run test --workspace=apps/worker -- src/sync/upsert-product.test.ts`
Expected: FAIL — `needsInheritanceReview` luôn `undefined`/`false` cho ca đầu (chưa set), vì code chưa gọi `detectNameDrift`.

- [ ] **Step 3: Viết implementation tối thiểu**

Trong `apps/worker/src/sync/upsert-product.ts`, sửa dòng import ở đầu file (dòng 2):

```typescript
import { parseVersionSuffix, detectNameDrift } from "./version-detection";
```

Trong nhánh `.N` của `upsertProductFromAmis` (bên trong `prisma.$transaction(async (tx) => { ... })`, ngay sau dòng tính `becomesNewCurrent` — dòng `const becomesNewCurrent = parsed.versionNumber > currentVersion.versionNumber;` — thêm 1 dòng tính `nameDrifted` NGAY TRƯỚC lệnh `tx.productVersion.create`:

```typescript
        const becomesNewCurrent = parsed.versionNumber > currentVersion.versionNumber;
        const nameDrifted = detectNameDrift(currentVersion.name, input.name);

        const newVersion = await tx.productVersion.create({
          data: {
            productId: existingBase.id,
            versionNumber: parsed.versionNumber,
            amisProductId: input.amisProductId,
            name: input.name,
            description: input.description,
            isCurrent: becomesNewCurrent,
            createdByAmisSync: true,
            needsInheritanceReview: nameDrifted,
          },
        });
        // Luôn kế thừa nội dung từ phiên bản ĐANG là currentVersion (nội dung tốt nhất hiện có),
        // dù bản mới này có trở thành current hay không — 1 phiên bản cũ mới phát hiện vẫn nên
        // có sẵn 1 baseline nội dung thay vì trống trơn.
        await cloneVersionContent(tx, currentVersion.id, newVersion.id, existingBase.baseCode);

        // Ghi vết audit khi tên trôi lớn (spec §12.1) — độc lập với becomesNewCurrent, vì cờ cảnh báo
        // áp dụng cho MỌI ProductVersion mới tạo, không riêng bản trở thành current.
        if (nameDrifted) {
          await tx.changeLogEntry.create({
            data: {
              versionId: newVersion.id,
              fieldPath: "nameDrift",
              oldValue: currentVersion.name,
              newValue: input.name,
              source: "AMIS_SYNC",
            },
          });
        }
```

(Đoạn `if (becomesNewCurrent) { ... }` bên dưới giữ nguyên không đổi.)

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npm run test --workspace=apps/worker -- src/sync/upsert-product.test.ts`
Expected: PASS toàn bộ (test cũ + 2 test mới).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/sync/upsert-product.ts apps/worker/src/sync/upsert-product.test.ts
git commit -m "feat(worker): flag needsInheritanceReview when AMIS version name drifts"
```

---

### Task 4: Route `PATCH /api/products/[baseCode]/versions/[versionNumber]/confirm-inheritance`

**Files:**
- Create: `apps/web/src/app/api/products/[baseCode]/versions/[versionNumber]/confirm-inheritance/route.ts`
- Test: `apps/web/src/app/api/products/[baseCode]/versions/[versionNumber]/confirm-inheritance/route.test.ts`

**Interfaces:**
- Consumes: `assertRole(role, allowed): void` + `ForbiddenError` từ `@/lib/auth/guard`; `auth(): Promise<{ user: { id, role, ... } } | null>` từ `@/lib/auth`.
- Produces: endpoint `PATCH` nhận `{ params: { baseCode: string; versionNumber: string } }`, trả `200 { ok: true }` khi thành công, `403` khi role không đủ, `404` khi không tìm thấy mã hàng/phiên bản — dùng bởi Task 5 (nút "Xác nhận đã kiểm tra" gọi endpoint này).

- [ ] **Step 1: Viết test thất bại**

Tạo `apps/web/src/app/api/products/[baseCode]/versions/[versionNumber]/confirm-inheritance/route.test.ts`:

```typescript
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

const baseCode = `CIRT${Date.now()}`;
let versionId: string;

describe("/api/products/[baseCode]/versions/[versionNumber]/confirm-inheritance", () => {
  beforeAll(async () => {
    const product = await prisma.product.create({ data: { baseCode, amisProductId: `amis-${baseCode}`, status: "PENDING_QC" } });
    const version = await prisma.productVersion.create({
      data: { productId: product.id, versionNumber: 1, amisProductId: `amis-v-${baseCode}`, name: "Test", isCurrent: true, needsInheritanceReview: true },
    });
    await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: version.id } });
    versionId = version.id;
  });

  beforeEach(() => vi.clearAllMocks());

  it("trả 403 khi là QC_STAFF", async () => {
    mockSession(UserRole.QC_STAFF);
    const req = new Request(`http://localhost/api/products/${baseCode}/versions/1/confirm-inheritance`, { method: "PATCH" });
    const res = await PATCH(req, { params: { baseCode, versionNumber: "1" } });
    expect(res.status).toBe(403);

    const version = await prisma.productVersion.findUnique({ where: { id: versionId } });
    expect(version?.needsInheritanceReview).toBe(true); // không đổi gì
  });

  it("MANAGER xác nhận được — xoá cờ và ghi ChangeLogEntry", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/versions/1/confirm-inheritance`, { method: "PATCH" });
    const res = await PATCH(req, { params: { baseCode, versionNumber: "1" } });
    expect(res.status).toBe(200);

    const version = await prisma.productVersion.findUnique({ where: { id: versionId } });
    expect(version?.needsInheritanceReview).toBe(false);

    const logs = await prisma.changeLogEntry.findMany({ where: { versionId } });
    expect(logs.some((l) => l.fieldPath === "inheritanceReviewConfirmed" && l.source === "MANUAL" && l.changedBy === "u1")).toBe(true);
  });

  it("trả 404 khi baseCode không tồn tại", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/KHONGTONTAI/versions/1/confirm-inheritance`, { method: "PATCH" });
    const res = await PATCH(req, { params: { baseCode: "KHONGTONTAI", versionNumber: "1" } });
    expect(res.status).toBe(404);
  });

  afterAll(async () => {
    await prisma.changeLogEntry.deleteMany({ where: { versionId } });
    await prisma.productVersion.deleteMany({ where: { id: versionId } });
    await prisma.product.deleteMany({ where: { baseCode } });
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npm run test --workspace=apps/web -- src/app/api/products/[baseCode]/versions/[versionNumber]/confirm-inheritance/route.test.ts`
Expected: FAIL — module `./route` chưa tồn tại.

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `apps/web/src/app/api/products/[baseCode]/versions/[versionNumber]/confirm-inheritance/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";

export async function PATCH(req: Request, { params }: { params: { baseCode: string; versionNumber: string } }) {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.MANAGER, UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
  // Không dùng `session!.user.id` — assertRole ở trên đã ném lỗi nếu role/session không hợp lệ,
  // nhưng TypeScript chưa thu hẹp được điều đó qua try/catch; guard tường minh này thay cho `!`.
  if (!session) return NextResponse.json({ error: "Không đủ quyền truy cập" }, { status: 403 });

  const product = await prisma.product.findUnique({ where: { baseCode: params.baseCode } });
  if (!product) return NextResponse.json({ error: "Không tìm thấy mã hàng" }, { status: 404 });

  const versionNumber = Number(params.versionNumber);
  const version = await prisma.productVersion.findFirst({ where: { productId: product.id, versionNumber } });
  if (!version) return NextResponse.json({ error: "Không tìm thấy phiên bản" }, { status: 404 });

  await prisma.$transaction([
    prisma.productVersion.update({ where: { id: version.id }, data: { needsInheritanceReview: false } }),
    prisma.changeLogEntry.create({
      data: {
        versionId: version.id,
        fieldPath: "inheritanceReviewConfirmed",
        oldValue: "true",
        newValue: "false",
        changedBy: session.user.id,
        source: "MANUAL",
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npm run test --workspace=apps/web -- src/app/api/products/[baseCode]/versions/[versionNumber]/confirm-inheritance/route.test.ts`
Expected: PASS toàn bộ 3 test.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/api/products/[baseCode]/versions/[versionNumber]/confirm-inheritance"
git commit -m "feat(web): add confirm-inheritance route for MANAGER/ADMIN"
```

---

### Task 5: Badge cảnh báo + nút xác nhận trong `HistoryTab`

**Files:**
- Modify: `apps/web/src/components/products/HistoryTab.tsx`
- Modify: `apps/web/src/components/products/ProductDetailTabs.tsx:121` (truyền thêm prop `role`)
- Test: Create `apps/web/src/components/products/HistoryTab.test.tsx`
- Modify: `apps/web/src/components/products/ProductDetailTabs.test.tsx` (không bắt buộc sửa — tab Lịch sử phiên bản dùng `versions: []` nên không lộ badge; giữ nguyên)

**Interfaces:**
- Consumes: `PATCH /api/products/[baseCode]/versions/[versionNumber]/confirm-inheritance` (Task 4); `extractErrorMessage(body, fallback): string` từ `@/lib/extract-error-message`; `UserRole` từ `@qc/db`.
- Produces: `HistoryTab({ product, role }: { product: ProductDetail; role: UserRole })` — thay chữ ký cũ `HistoryTab({ product })`, mọi call site phải truyền thêm `role`.

- [ ] **Step 1: Viết test thất bại**

Tạo `apps/web/src/components/products/HistoryTab.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UserRole } from "@qc/db";
import { HistoryTab } from "./HistoryTab";
import type { ProductDetail } from "@/lib/products/get-product-detail";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function makeVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    productId: "p1",
    versionNumber: 2,
    amisProductId: "code:X.2",
    name: "Tem giấy cán bóng Nước muối Sao Mai 500ml",
    description: null,
    isCurrent: true,
    createdByAmisSync: true,
    createdAt: new Date(),
    needsInheritanceReview: true,
    changeLogs: [],
    tcsp: null,
    qc: null,
    packaging: null,
    documents: null,
    ...overrides,
  };
}

function makeProduct(versions: ReturnType<typeof makeVersion>[]): ProductDetail {
  return { baseCode: "SI00035", versions } as unknown as ProductDetail;
}

beforeEach(() => {
  refresh.mockClear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
});

describe("HistoryTab", () => {
  it("hiện badge cảnh báo khi needsInheritanceReview true", () => {
    render(<HistoryTab product={makeProduct([makeVersion()])} role={UserRole.QC_STAFF} />);
    expect(screen.getByText(/Cần xác nhận kế thừa/)).toBeDefined();
  });

  it("KHÔNG hiện badge khi needsInheritanceReview false", () => {
    render(<HistoryTab product={makeProduct([makeVersion({ needsInheritanceReview: false })])} role={UserRole.QC_STAFF} />);
    expect(screen.queryByText(/Cần xác nhận kế thừa/)).toBeNull();
  });

  it("QC_STAFF thấy badge nhưng KHÔNG thấy nút xác nhận", () => {
    render(<HistoryTab product={makeProduct([makeVersion()])} role={UserRole.QC_STAFF} />);
    expect(screen.queryByText("Xác nhận đã kiểm tra")).toBeNull();
  });

  it("MANAGER thấy nút xác nhận, bấm vào gọi đúng endpoint và refresh", async () => {
    render(<HistoryTab product={makeProduct([makeVersion()])} role={UserRole.MANAGER} />);
    fireEvent.click(screen.getByText("Xác nhận đã kiểm tra"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/products/SI00035/versions/2/confirm-inheritance",
      expect.objectContaining({ method: "PATCH" })
    );
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npm run test --workspace=apps/web -- src/components/products/HistoryTab.test.tsx`
Expected: FAIL — chưa có badge/nút, `HistoryTab` chưa nhận prop `role`.

- [ ] **Step 3: Viết implementation tối thiểu**

Thay toàn bộ nội dung `apps/web/src/components/products/HistoryTab.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserRole } from "@qc/db";
import type { ProductDetail } from "@/lib/products/get-product-detail";
import { extractErrorMessage } from "@/lib/extract-error-message";

const SOURCE_LABELS: Record<string, string> = { AMIS_SYNC: "Đồng bộ AMIS", MANUAL: "Chỉnh sửa thủ công" };

export function HistoryTab({ product, role }: { product: ProductDetail; role: UserRole }) {
  const router = useRouter();
  const canConfirm = role === UserRole.MANAGER || role === UserRole.ADMIN;
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm(versionNumber: number) {
    setConfirmingId(String(versionNumber));
    setError(null);
    const res = await fetch(`/api/products/${product.baseCode}/versions/${versionNumber}/confirm-inheritance`, { method: "PATCH" });
    setConfirmingId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(extractErrorMessage(body, "Xác nhận thất bại — thử lại."));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4 text-sm">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {product.versions.map((v) => (
        <div key={v.id} className="rounded border p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {product.baseCode}.{v.versionNumber} {v.isCurrent && <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">Hiện hành</span>}
              {v.needsInheritanceReview && (
                <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">⚠ Cần xác nhận kế thừa</span>
              )}
            </span>
            <div className="flex items-center gap-3">
              {v.needsInheritanceReview && canConfirm && (
                <button
                  onClick={() => handleConfirm(v.versionNumber)}
                  disabled={confirmingId === String(v.versionNumber)}
                  className="rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {confirmingId === String(v.versionNumber) ? "Đang xác nhận..." : "Xác nhận đã kiểm tra"}
                </button>
              )}
              {!v.isCurrent && (
                <Link href={`/products/${product.baseCode}/v/${v.versionNumber}`} className="text-brand-600 hover:underline">
                  Xem phiên bản này
                </Link>
              )}
            </div>
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

Sửa `apps/web/src/components/products/ProductDetailTabs.tsx:121`, đổi:

```typescript
        {activeTab === "Lịch sử phiên bản" && <HistoryTab product={product} />}
```

thành:

```typescript
        {activeTab === "Lịch sử phiên bản" && <HistoryTab product={product} role={role} />}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npm run test --workspace=apps/web -- src/components/products/HistoryTab.test.tsx src/components/products/ProductDetailTabs.test.tsx`
Expected: PASS toàn bộ — cả 4 test mới lẫn test cũ của `ProductDetailTabs` (test cũ dùng `versions: []` nên không bị ảnh hưởng bởi badge/nút mới).

- [ ] **Step 5: Chạy toàn bộ test suite (regression cuối)**

Run: `npm test`
Expected: PASS toàn bộ — xác nhận không phá vỡ gì ở các phần khác của hệ thống (TCSPTab/QCTab/PackagingTab/DocumentsTab/sync worker...).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/products/HistoryTab.tsx apps/web/src/components/products/HistoryTab.test.tsx apps/web/src/components/products/ProductDetailTabs.tsx
git commit -m "feat(web): show inheritance-review warning badge + confirm button in HistoryTab"
```
