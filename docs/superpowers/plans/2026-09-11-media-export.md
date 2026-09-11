# Media & Xuất file (Plan 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm upload ảnh/video/tài liệu (MinIO tự host) cho 4 tab nội dung, kế thừa media qua các phiên bản, mở rộng trang phiên bản cũ hiển thị đầy đủ, và xuất file TCSP theo mẫu Excel thật của Hoàng Gia.

**Architecture:** Gói `@qc/storage` dùng chung (web + worker) bọc AWS SDK v3 trỏ vào MinIO, cấp presigned URL để client upload/xem thẳng không qua server app. Media kế thừa qua phiên bản bằng `CopyObject` (mỗi phiên bản sở hữu file độc lập). Xuất Excel bằng `exceljs` mở template thật, điền dữ liệu, co giãn bảng thông số động.

**Tech Stack:** `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `exceljs`, MinIO (Docker), Next.js Route Handlers, Prisma (schema đã có sẵn `MediaAsset`/`ProductDocument`, không cần migration).

**Spec:** [docs/superpowers/specs/2026-09-09-qc-hoanggia-design.md](../specs/2026-09-09-qc-hoanggia-design.md) §7 (Media), §8 (Xuất TCSP), §10 (hạ tầng) — executor đọc cả spec lẫn plan này.

## Global Constraints

- Quyền tạo/sửa/xóa media & tài liệu: MANAGER/ADMIN (giống quyền sửa nội dung văn bản). Quyền tải TCSP Excel: cả 3 vai trò.
- Mỗi phiên bản sở hữu file MinIO độc lập — không bao giờ 2 phiên bản trỏ chung 1 `storageKey`.
- Xóa media = xóa hẳn file MinIO + dòng DB (không soft-delete).
- Link xem/tải file luôn là presigned GET, hết hạn 5 phút, sinh lại mỗi lần trang render — không lưu link này ở đâu khác.
- Lỗi thao tác MinIO trên 1 file lẻ (copy khi kế thừa) không được làm hỏng cả lần đồng bộ AMIS — bỏ qua, ghi log, tiếp tục.
- Giới hạn dung lượng: ảnh ~10MB, video ~200MB (mp4), tài liệu ~20MB (PDF/ảnh/Office).
- Mọi route API mới theo đúng pattern đã có (`assertRole`/`ForbiddenError`, resolve `currentVersionId` server-side, `recordChanges` ghi `ChangeLogEntry`) — không lặp lại pattern `session!` non-null assertion (chuẩn đã áp dụng từ Plan 3a).

---

### Task 1: Gói `@qc/storage` dùng chung + MinIO trong Docker Compose

**Files:**
- Create: `packages/storage/package.json`
- Create: `packages/storage/tsconfig.json`
- Create: `packages/storage/src/client.ts`
- Create: `packages/storage/src/limits.ts`
- Create: `packages/storage/src/presign.ts`
- Create: `packages/storage/src/index.ts`
- Create: `apps/web/src/lib/storage/storage.integration.test.ts`
- Modify: `infra/docker-compose.yml`
- Modify: `infra/.env`
- Modify: `infra/.env.example`
- Modify: `apps/web/.env.local`
- Modify: `apps/web/package.json`
- Modify: `apps/worker/package.json`
- Modify: `package.json` (root)

**Interfaces:**
- Produces (dùng lại nguyên xi ở mọi task sau): `buildStorageKey(baseCode, versionId, fileName): string`, `getUploadUrl({storageKey, mimeType, size}): Promise<string>`, `getViewUrl(storageKey): Promise<string>`, `copyObject(fromKey, toKey): Promise<void>`, `deleteObject(storageKey): Promise<void>`, `ensureBucketExists(): Promise<void>`, `validateMediaUpload(mimeType, size): void` (ném `UploadValidationError`), `validateDocumentUpload(mimeType, size): void`, hằng số `MAX_IMAGE_BYTES`/`MAX_VIDEO_BYTES`/`ALLOWED_IMAGE_MIME`/`ALLOWED_VIDEO_MIME`/`ALLOWED_DOCUMENT_MIME`.

- [ ] **Bước 1: Thêm service `minio` vào `infra/docker-compose.yml`**

Mở `infra/docker-compose.yml`, thêm service sau vào `services:` (ngang hàng `postgres`), và thêm `qc_minio_data:` vào `volumes:` ở cuối file:

```yaml
  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: qc_minio
      MINIO_ROOT_PASSWORD: qc_minio_password
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - qc_minio_data:/data
```

Trong service `web` và `worker`, thêm dòng `STORAGE_ENDPOINT: http://minio:9000` vào khối `environment:` đã có (cùng lý do như `DATABASE_URL`/`SYNC_WORKER_URL` — bên trong mạng Compose, `localhost` không trỏ tới container `minio`), và thêm `- minio` vào `depends_on:` của cả 2 service.

- [ ] **Bước 2: Điền biến môi trường**

`infra/.env` (file thật, gitignored) — thêm/sửa các dòng đã có sẵn placeholder:
```
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_PUBLIC_ENDPOINT=
STORAGE_BUCKET=qc-hoanggia
STORAGE_ACCESS_KEY=qc_minio
STORAGE_SECRET_KEY=qc_minio_password
```
(`STORAGE_PUBLIC_ENDPOINT` để trống — code sẽ tự dùng `STORAGE_ENDPOINT` khi trống, xem `client.ts` bước 3. Khi triển khai thật qua Docker, `STORAGE_ENDPOINT` sẽ là `http://minio:9000` nội bộ còn `STORAGE_PUBLIC_ENDPOINT` phải là địa chỉ/domain mà trình duyệt người dùng thật sự gọi tới được — 2 giá trị đó bắt buộc khác nhau lúc đó, vì presigned URL ký theo `STORAGE_PUBLIC_ENDPOINT` phải là địa chỉ trình duyệt gọi được.)

`infra/.env.example` — thêm block chú thích (cạnh block `# --- Object storage (ảnh/video/tài liệu) ---` đã có sẵn 4 dòng trống):
```
# --- Object storage (ảnh/video/tài liệu) ---
# MinIO tự host qua Docker Compose (service "minio"). Endpoint nội bộ dùng cho các thao tác
# server-to-server (CopyObject, DeleteObject...); nếu STORAGE_PUBLIC_ENDPOINT để trống, presigned
# URL cấp cho trình duyệt cũng dùng STORAGE_ENDPOINT — chỉ cần tách riêng khi endpoint nội bộ
# (vd http://minio:9000 trong mạng Docker) khác với địa chỉ trình duyệt gọi được.
STORAGE_ENDPOINT=
STORAGE_PUBLIC_ENDPOINT=
STORAGE_BUCKET=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
```

`apps/web/.env.local` — thêm 3 dòng (dev chạy `next dev` ngoài Docker, không cần `STORAGE_PUBLIC_ENDPOINT`):
```
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_BUCKET=qc-hoanggia
STORAGE_ACCESS_KEY=qc_minio
STORAGE_SECRET_KEY=qc_minio_password
```

- [ ] **Bước 3: Tạo gói `packages/storage`**

`packages/storage/package.json`:
```json
{
  "name": "@qc/storage",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.600.0",
    "@aws-sdk/s3-request-presigner": "^3.600.0"
  },
  "devDependencies": {
    "typescript": "^5.6.2"
  }
}
```

`packages/storage/tsconfig.json` (mirror `packages/db/tsconfig.json`):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist",
    "declaration": true
  },
  "include": ["src/**/*.ts"]
}
```

`packages/storage/src/client.ts`:
```ts
import { S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name} (xem infra/.env.example)`);
  return v;
}

/** `endpoint`: dùng cho thao tác server-to-server (CopyObject/DeleteObject/HeadBucket). `publicEndpoint`:
 * dùng khi KÝ url cho trình duyệt — khác `endpoint` khi chạy trong Docker (nội bộ là tên service
 * "minio", nhưng trình duyệt cần địa chỉ/domain thật gọi được). Để trống STORAGE_PUBLIC_ENDPOINT thì
 * dùng luôn STORAGE_ENDPOINT (đúng cho dev chạy `next dev` ngoài Docker, cả 2 đều là localhost). */
export function getStorageConfig() {
  const endpoint = requireEnv("STORAGE_ENDPOINT");
  return {
    endpoint,
    publicEndpoint: process.env.STORAGE_PUBLIC_ENDPOINT || endpoint,
    bucket: requireEnv("STORAGE_BUCKET"),
    accessKeyId: requireEnv("STORAGE_ACCESS_KEY"),
    secretAccessKey: requireEnv("STORAGE_SECRET_KEY"),
  };
}

let cachedClient: S3Client | null = null;
/** Client dùng cho thao tác nội bộ (CopyObject/DeleteObject/HeadBucket/CreateBucket). */
export function getS3Client(): S3Client {
  if (cachedClient) return cachedClient;
  const cfg = getStorageConfig();
  cachedClient = new S3Client({
    endpoint: cfg.endpoint,
    region: "us-east-1", // MinIO không dùng region thật, SDK yêu cầu 1 giá trị bất kỳ
    forcePathStyle: true, // MinIO cần path-style (http://host:port/bucket/key)
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return cachedClient;
}

let cachedPublicClient: S3Client | null = null;
/** Client RIÊNG chỉ dùng để ký presigned URL cho trình duyệt — trỏ `publicEndpoint`. */
export function getPublicS3Client(): S3Client {
  if (cachedPublicClient) return cachedPublicClient;
  const cfg = getStorageConfig();
  cachedPublicClient = new S3Client({
    endpoint: cfg.publicEndpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return cachedPublicClient;
}

let bucketReadyPromise: Promise<void> | null = null;
/** Tạo bucket nếu chưa có — gọi nhiều lần cũng chỉ chạy network call 1 lần (cache promise). */
export function ensureBucketExists(): Promise<void> {
  if (!bucketReadyPromise) {
    bucketReadyPromise = (async () => {
      const client = getS3Client();
      const bucket = getStorageConfig().bucket;
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
    })();
  }
  return bucketReadyPromise;
}
```

`packages/storage/src/limits.ts`:
```ts
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];
export const ALLOWED_VIDEO_MIME = ["video/mp4"];
export const ALLOWED_DOCUMENT_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export class UploadValidationError extends Error {}

/** Kiểm tra mimeType/size khai báo trước khi cấp presigned URL cho ảnh/video (tab TCSP/QC/Đóng gói) —
 * ném `UploadValidationError`, route gọi hàm này bắt lỗi và trả 400. */
export function validateMediaUpload(mimeType: string, size: number): void {
  const isImage = ALLOWED_IMAGE_MIME.includes(mimeType);
  const isVideo = ALLOWED_VIDEO_MIME.includes(mimeType);
  if (!isImage && !isVideo) {
    throw new UploadValidationError(`Định dạng file không được hỗ trợ: ${mimeType}`);
  }
  const max = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (size <= 0 || size > max) {
    throw new UploadValidationError(`Dung lượng file vượt quá giới hạn cho phép (${Math.round(max / 1024 / 1024)}MB)`);
  }
}

/** Cùng logic cho tài liệu (tab Giấy tờ sản phẩm) — giới hạn/định dạng khác ảnh/video. */
export function validateDocumentUpload(mimeType: string, size: number): void {
  if (!ALLOWED_DOCUMENT_MIME.includes(mimeType)) {
    throw new UploadValidationError(`Định dạng file không được hỗ trợ: ${mimeType}`);
  }
  if (size <= 0 || size > MAX_DOCUMENT_BYTES) {
    throw new UploadValidationError(`Dung lượng file vượt quá giới hạn cho phép (${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)}MB)`);
  }
}
```

`packages/storage/src/presign.ts`:
```ts
import { PutObjectCommand, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { getS3Client, getPublicS3Client, getStorageConfig, ensureBucketExists } from "./client";

const UPLOAD_URL_EXPIRY_SECONDS = 15 * 60; // đủ thời gian cho video ~200MB trên mạng chậm
const VIEW_URL_EXPIRY_SECONDS = 5 * 60; // "vài phút" theo spec §7 — không có link công khai vĩnh viễn

/** Sinh storageKey duy nhất cho 1 file thuộc 1 phiên bản cụ thể — KHÔNG dùng lại giữa các phiên bản
 * (mỗi phiên bản sở hữu file độc lập, xem spec §7 phần Kế thừa media). */
export function buildStorageKey(baseCode: string, versionId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  return `products/${baseCode}/${versionId}/${randomUUID()}-${safeName}`;
}

/** Sinh presigned PUT URL để client tải file lên thẳng MinIO. Ký cứng Content-Length/Content-Type vào
 * chữ ký — client PUT với header khác giá trị đã khai lúc xin URL sẽ bị MinIO từ chối
 * (SignatureDoesNotMatch), nhờ vậy chặn được việc khai dung lượng nhỏ rồi tải file to hơn thật. */
export async function getUploadUrl(params: { storageKey: string; mimeType: string; size: number }): Promise<string> {
  await ensureBucketExists();
  const bucket = getStorageConfig().bucket;
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: params.storageKey,
    ContentType: params.mimeType,
    ContentLength: params.size,
  });
  return getSignedUrl(getPublicS3Client(), command, { expiresIn: UPLOAD_URL_EXPIRY_SECONDS });
}

/** Link GET đã ký để xem/tải 1 file — hết hạn sau 5 phút, gọi lại mỗi khi trang được render. */
export async function getViewUrl(storageKey: string): Promise<string> {
  const bucket = getStorageConfig().bucket;
  const command = new GetObjectCommand({ Bucket: bucket, Key: storageKey });
  return getSignedUrl(getPublicS3Client(), command, { expiresIn: VIEW_URL_EXPIRY_SECONDS });
}

/** Sao chép 1 object sang storageKey mới, tức thời trên server MinIO (không tải xuống rồi tải lên
 * lại) — dùng khi kế thừa media sang phiên bản mới, để mỗi phiên bản có file độc lập. */
export async function copyObject(fromKey: string, toKey: string): Promise<void> {
  const bucket = getStorageConfig().bucket;
  await getS3Client().send(new CopyObjectCommand({ Bucket: bucket, CopySource: `${bucket}/${fromKey}`, Key: toKey }));
}

export async function deleteObject(storageKey: string): Promise<void> {
  const bucket = getStorageConfig().bucket;
  await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
}
```

`packages/storage/src/index.ts`:
```ts
export { getS3Client, getPublicS3Client, ensureBucketExists, getStorageConfig } from "./client";
export { buildStorageKey, getUploadUrl, getViewUrl, copyObject, deleteObject } from "./presign";
export {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_DOCUMENT_BYTES,
  ALLOWED_IMAGE_MIME,
  ALLOWED_VIDEO_MIME,
  ALLOWED_DOCUMENT_MIME,
  UploadValidationError,
  validateMediaUpload,
  validateDocumentUpload,
} from "./limits";
```

- [ ] **Bước 4: Nối gói vào web/worker + root build**

`apps/web/package.json` — thêm vào `dependencies`: `"@qc/storage": "*"`.
`apps/worker/package.json` — thêm vào `dependencies`: `"@qc/storage": "*"`.

`package.json` (root) — sửa `postinstall` và `build`:
```json
"postinstall": "node -e \"const {existsSync}=require('fs');const {execSync}=require('child_process');for(const p of ['packages/db','packages/storage']){if(existsSync(p+'/src'))execSync('npm run build --workspace='+p,{stdio:'inherit'})}\"",
"build": "npm run build --workspace=packages/db && npm run build --workspace=packages/storage && npm run build --workspace=apps/web && npm run build --workspace=apps/worker",
```

Chạy: `npm install` (từ repo root) để tạo symlink workspace + chạy postinstall build `packages/storage`.

- [ ] **Bước 5: Khởi động MinIO, viết test thật, chạy xanh**

```bash
docker compose -f infra/docker-compose.yml up -d minio
```

`apps/web/src/lib/storage/storage.integration.test.ts` (test thật chống lại MinIO local, đúng nguyên tắc dự án đã theo từ đầu — không mock hoàn toàn):
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { buildStorageKey, getUploadUrl, getViewUrl, copyObject, deleteObject, ensureBucketExists } from "@qc/storage";

describe("@qc/storage (MinIO thật, chạy local)", () => {
  beforeAll(async () => {
    await ensureBucketExists();
  });

  it("upload qua presigned URL rồi tải lại đúng nội dung, xóa xong thì không tải được nữa", async () => {
    const key = buildStorageKey("TESTCODE", "test-version-1", "anh.jpg");
    const content = Buffer.from("noi dung test file anh gia");
    const uploadUrl = await getUploadUrl({ storageKey: key, mimeType: "image/jpeg", size: content.length });

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "Content-Length": String(content.length) },
      body: content,
    });
    expect(putRes.ok).toBe(true);

    const viewUrl = await getViewUrl(key);
    const getRes = await fetch(viewUrl);
    expect(getRes.ok).toBe(true);
    const downloaded = Buffer.from(await getRes.arrayBuffer());
    expect(downloaded.equals(content)).toBe(true);

    await deleteObject(key);
    const getAfterDelete = await fetch(await getViewUrl(key));
    expect(getAfterDelete.ok).toBe(false);
  });

  it("upload với Content-Length khai sai (nhỏ hơn thật) bị từ chối", async () => {
    const key = buildStorageKey("TESTCODE", "test-version-1", "video.mp4");
    const uploadUrl = await getUploadUrl({ storageKey: key, mimeType: "video/mp4", size: 10 });
    const actualContent = Buffer.alloc(1000, "x"); // lớn hơn 10 byte đã khai báo lúc xin URL

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": String(actualContent.length) },
      body: actualContent,
    });
    expect(putRes.ok).toBe(false);
  });

  it("copyObject tạo bản sao độc lập — xóa bản sao không ảnh hưởng file gốc", async () => {
    const originalKey = buildStorageKey("TESTCODE", "test-version-1", "goc.jpg");
    const copiedKey = buildStorageKey("TESTCODE", "test-version-2", "goc.jpg");
    const content = Buffer.from("noi dung goc");

    const uploadUrl = await getUploadUrl({ storageKey: originalKey, mimeType: "image/jpeg", size: content.length });
    await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "Content-Length": String(content.length) },
      body: content,
    });

    await copyObject(originalKey, copiedKey);
    await deleteObject(copiedKey);

    const res = await fetch(await getViewUrl(originalKey));
    expect(res.ok).toBe(true); // bản gốc vẫn còn nguyên sau khi xóa bản sao

    await deleteObject(originalKey);
  });
});
```

Chạy: `npm run test --workspace=apps/web -- storage.integration` — kỳ vọng: FAIL trước khi có `packages/storage` build xong, PASS sau bước 3-4.

- [ ] **Bước 6: Commit**

```bash
git add packages/storage apps/web/src/lib/storage infra/docker-compose.yml infra/.env.example apps/web/.env.local apps/web/package.json apps/worker/package.json package.json package-lock.json
git commit -m "feat: gói @qc/storage dùng chung + MinIO trong Docker Compose"
```

(Không `git add infra/.env` — file gitignored, chỉ cập nhật local.)

---

### Task 2: API upload/tạo/sửa/xóa `MediaAsset` cho tab TCSP/QC/Đóng gói

**Files:**
- Create: `apps/web/src/lib/products/media.ts`
- Create: `apps/web/src/app/api/products/[baseCode]/media/upload-url/route.ts`
- Create: `apps/web/src/app/api/products/[baseCode]/media/upload-url/route.test.ts`
- Create: `apps/web/src/app/api/products/[baseCode]/media/route.ts`
- Create: `apps/web/src/app/api/products/[baseCode]/media/route.test.ts`
- Create: `apps/web/src/app/api/products/[baseCode]/media/[assetId]/route.ts`
- Create: `apps/web/src/app/api/products/[baseCode]/media/[assetId]/route.test.ts`

**Interfaces:**
- Consumes: `@qc/storage` (Task 1) nguyên xi; `assertRole`/`ForbiddenError` (`@/lib/auth/guard`); `recordChanges` (`@/lib/products/change-log`).
- Produces: `resolveMediaParentId(tx, versionId, tab): Promise<string>`, `mediaForeignKeyField(tab): "tcspId"|"qcId"|"packagingId"` — dùng lại ở Task 3 (UI) không cần đổi.

- [ ] **Bước 1: `apps/web/src/lib/products/media.ts`**

```ts
import type { PrismaTransactionClient } from "@qc/db";

export type MediaTab = "tcsp" | "qc" | "packaging";

/** Đảm bảo bản ghi TCSPData/QCData/PackagingData của phiên bản đã tồn tại (tạo rỗng nếu chưa — người
 * dùng có thể muốn upload ảnh trước khi nhập nội dung văn bản), trả về id để gắn MediaAsset. */
export async function resolveMediaParentId(tx: PrismaTransactionClient, versionId: string, tab: MediaTab): Promise<string> {
  switch (tab) {
    case "tcsp": {
      const row = await tx.tCSPData.upsert({ where: { versionId }, update: {}, create: { versionId } });
      return row.id;
    }
    case "qc": {
      const row = await tx.qCData.upsert({ where: { versionId }, update: {}, create: { versionId } });
      return row.id;
    }
    case "packaging": {
      const row = await tx.packagingData.upsert({ where: { versionId }, update: {}, create: { versionId } });
      return row.id;
    }
  }
}

export function mediaForeignKeyField(tab: MediaTab): "tcspId" | "qcId" | "packagingId" {
  return tab === "tcsp" ? "tcspId" : tab === "qc" ? "qcId" : "packagingId";
}
```

- [ ] **Bước 2: `POST /api/products/[baseCode]/media/upload-url`**

Viết test trước (`route.test.ts`), theo đúng pattern `qc/route.test.ts` (mock `@/lib/auth`, tạo product/version thật qua Postgres):

```ts
import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma, UserRole } from "@qc/db";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
import { POST } from "./route";

function mockSession(role: UserRole | null) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    role ? { user: { id: "u1", username: "test", fullName: "Test", role } } : null
  );
}

const baseCode = `MEDURL${Date.now()}`;

describe("/api/products/[baseCode]/media/upload-url", () => {
  beforeAll(async () => {
    const product = await prisma.product.create({ data: { baseCode, amisProductId: `amis-${baseCode}`, status: "PENDING_QC" } });
    const version = await prisma.productVersion.create({
      data: { productId: product.id, versionNumber: 1, amisProductId: `amis-v-${baseCode}`, name: "Test", isCurrent: true },
    });
    await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: version.id } });
  });

  beforeEach(() => vi.clearAllMocks());

  it("trả 403 khi là QC_STAFF", async () => {
    mockSession(UserRole.QC_STAFF);
    const req = new Request(`http://localhost/api/products/${baseCode}/media/upload-url`, {
      method: "POST",
      body: JSON.stringify({ tab: "tcsp", fileName: "anh.jpg", mimeType: "image/jpeg", size: 1000 }),
    });
    const res = await POST(req, { params: { baseCode } });
    expect(res.status).toBe(403);
  });

  it("MANAGER xin được URL thật, PUT lên đúng URL thành công", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/media/upload-url`, {
      method: "POST",
      body: JSON.stringify({ tab: "tcsp", fileName: "anh.jpg", mimeType: "image/jpeg", size: 12 }),
    });
    const res = await POST(req, { params: { baseCode } });
    expect(res.status).toBe(200);
    const { uploadUrl, storageKey } = await res.json();
    expect(storageKey).toContain(baseCode);

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "Content-Length": "12" },
      body: Buffer.from("noi dung xxx"),
    });
    expect(putRes.ok).toBe(true);
  });

  it("trả 400 khi vượt giới hạn dung lượng ảnh", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request(`http://localhost/api/products/${baseCode}/media/upload-url`, {
      method: "POST",
      body: JSON.stringify({ tab: "tcsp", fileName: "anh.jpg", mimeType: "image/jpeg", size: 20 * 1024 * 1024 }),
    });
    const res = await POST(req, { params: { baseCode } });
    expect(res.status).toBe(400);
  });

  afterAll(async () => {
    await prisma.productVersion.deleteMany({ where: { product: { baseCode } } });
    await prisma.product.deleteMany({ where: { baseCode } });
    await prisma.$disconnect();
  });
});
```

Chạy test → FAIL (chưa có route). Viết `route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";
import { buildStorageKey, getUploadUrl, validateMediaUpload, UploadValidationError } from "@qc/storage";

const bodySchema = z.object({
  tab: z.enum(["tcsp", "qc", "packaging"]),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
});

export async function POST(req: Request, { params }: { params: { baseCode: string } }) {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.MANAGER, UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
  if (!session) return NextResponse.json({ error: "Không đủ quyền truy cập" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const product = await prisma.product.findUnique({ where: { baseCode: params.baseCode } });
  if (!product || !product.currentVersionId) {
    return NextResponse.json({ error: "Không tìm thấy mã hàng" }, { status: 404 });
  }

  try {
    validateMediaUpload(parsed.data.mimeType, parsed.data.size);
  } catch (err) {
    if (err instanceof UploadValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  const storageKey = buildStorageKey(params.baseCode, product.currentVersionId, parsed.data.fileName);
  const uploadUrl = await getUploadUrl({ storageKey, mimeType: parsed.data.mimeType, size: parsed.data.size });

  return NextResponse.json({ uploadUrl, storageKey });
}
```

Chạy test → PASS.

- [ ] **Bước 3: `POST /api/products/[baseCode]/media` (tạo `MediaAsset` sau khi đã PUT xong)**

Test trước (`route.test.ts`) — tạo product/version thật, mock auth, kiểm tra: 403 cho QC_STAFF; MANAGER tạo thành công → đọc lại `mediaAsset.findMany({where:{tcspId: ...}})` thấy đúng 1 dòng, và `changeLogEntry` có dòng `fieldPath` bắt đầu bằng `media.`; test upload TCSPData chưa từng tồn tại vẫn tạo được (chứng minh `resolveMediaParentId` upsert đúng).

```ts
// (theo pattern route.test.ts đã có — mockSession, tạo product/version ở beforeAll)
it("MANAGER tạo MediaAsset thành công dù TCSPData chưa từng tồn tại, ghi ChangeLogEntry", async () => {
  mockSession(UserRole.MANAGER);
  const req = new Request(`http://localhost/api/products/${baseCode}/media`, {
    method: "POST",
    body: JSON.stringify({ tab: "tcsp", storageKey: "products/x/y/z-anh.jpg", mimeType: "image/jpeg", caption: "Ảnh mặt trước", sortOrder: 0 }),
  });
  const res = await POST(req, { params: { baseCode } });
  expect(res.status).toBe(200);
  const { id } = await res.json();

  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  expect(asset?.caption).toBe("Ảnh mặt trước");

  const logs = await prisma.changeLogEntry.findMany({ where: { versionId } });
  expect(logs.some((l) => l.fieldPath === "media.tcsp")).toBe(true);
});
```

`route.ts`:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";
import { recordChanges } from "@/lib/products/change-log";
import { resolveMediaParentId, mediaForeignKeyField } from "@/lib/products/media";

const createSchema = z.object({
  tab: z.enum(["tcsp", "qc", "packaging"]),
  storageKey: z.string().min(1),
  mimeType: z.string().min(1),
  caption: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export async function POST(req: Request, { params }: { params: { baseCode: string } }) {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.MANAGER, UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
  if (!session) return NextResponse.json({ error: "Không đủ quyền truy cập" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const product = await prisma.product.findUnique({ where: { baseCode: params.baseCode } });
  if (!product || !product.currentVersionId) {
    return NextResponse.json({ error: "Không tìm thấy mã hàng" }, { status: 404 });
  }
  const versionId = product.currentVersionId;

  const created = await prisma.$transaction(async (tx) => {
    const parentId = await resolveMediaParentId(tx, versionId, parsed.data.tab);
    const fkField = mediaForeignKeyField(parsed.data.tab);
    const asset = await tx.mediaAsset.create({
      data: {
        storageKey: parsed.data.storageKey,
        mimeType: parsed.data.mimeType,
        caption: parsed.data.caption ?? null,
        sortOrder: parsed.data.sortOrder ?? 0,
        [fkField]: parentId,
      },
    });
    await recordChanges(
      versionId,
      session.user.id,
      [{ fieldPath: `media.${parsed.data.tab}`, oldValue: null, newValue: parsed.data.caption || parsed.data.storageKey.split("/").pop()! }],
      tx
    );
    return asset;
  });

  return NextResponse.json({ id: created.id });
}
```

Chạy test → PASS.

- [ ] **Bước 4: `PATCH`/`DELETE /api/products/[baseCode]/media/[assetId]`**

Cần xác thực asset thuộc đúng `baseCode` VÀ đúng phiên bản HIỆN HÀNH (chặn sửa/xóa media của phiên bản cũ, vốn chỉ đọc) trước khi cho sửa/xóa — viết helper riêng dùng chung cho cả PATCH/DELETE trong cùng file route:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";
import { recordChanges } from "@/lib/products/change-log";
import { deleteObject } from "@qc/storage";

async function findEditableAsset(baseCode: string, assetId: string) {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    include: { tcsp: true, qc: true, packaging: true },
  });
  if (!asset) return null;
  const versionId = asset.tcsp?.versionId ?? asset.qc?.versionId ?? asset.packaging?.versionId;
  if (!versionId) return null;
  const version = await prisma.productVersion.findUnique({ where: { id: versionId }, include: { product: true } });
  if (!version || version.product.baseCode !== baseCode || version.product.currentVersionId !== version.id) {
    return null;
  }
  return { asset, versionId };
}

const patchSchema = z.object({ caption: z.string().nullable().optional(), sortOrder: z.number().int().optional() });

export async function PATCH(req: Request, { params }: { params: { baseCode: string; assetId: string } }) {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.MANAGER, UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const found = await findEditableAsset(params.baseCode, params.assetId);
  if (!found) return NextResponse.json({ error: "Không tìm thấy file hoặc không phải phiên bản hiện hành" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await prisma.mediaAsset.update({ where: { id: params.assetId }, data: parsed.data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { baseCode: string; assetId: string } }) {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.MANAGER, UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
  if (!session) return NextResponse.json({ error: "Không đủ quyền truy cập" }, { status: 403 });

  const found = await findEditableAsset(params.baseCode, params.assetId);
  if (!found) return NextResponse.json({ error: "Không tìm thấy file hoặc không phải phiên bản hiện hành" }, { status: 404 });

  await deleteObject(found.asset.storageKey);
  await prisma.$transaction(async (tx) => {
    await tx.mediaAsset.delete({ where: { id: params.assetId } });
    await recordChanges(found.versionId, session.user.id, [{ fieldPath: "media", oldValue: found.asset.caption || found.asset.storageKey.split("/").pop()!, newValue: null }], tx);
  });

  return NextResponse.json({ ok: true });
}
```

`route.test.ts` (theo pattern trên): 403 QC_STAFF cho cả PATCH/DELETE; MANAGER PATCH đổi được caption; MANAGER DELETE xóa dòng DB **và** thật sự xóa file trên MinIO (upload thật 1 file nhỏ trước, DELETE xong thì `fetch(getViewUrl(...))` trả về lỗi — chứng minh xóa file thật, không chỉ xóa dòng DB); DELETE asset thuộc phiên bản KHÔNG phải hiện hành → 404.

Chạy đủ test → PASS.

- [ ] **Bước 5: Chạy toàn bộ suite + commit**

```bash
npm run test --workspace=apps/web
git add apps/web/src/lib/products/media.ts apps/web/src/app/api/products/\[baseCode\]/media
git commit -m "feat(web): API upload/tạo/sửa/xóa MediaAsset (tab TCSP/QC/Đóng gói)"
```

---

### Task 3: UI upload/xem media trong tab TCSP/QC/Đóng gói

**Files:**
- Modify: `apps/web/src/lib/products/get-product-detail.ts`
- Create: `apps/web/src/lib/products/build-media-url-map.ts`
- Create: `apps/web/src/components/products/MediaUploader.tsx`
- Create: `apps/web/src/components/products/MediaUploader.test.tsx`
- Create: `apps/web/src/components/products/MediaGallery.tsx`
- Modify: `apps/web/src/components/products/TCSPTab.tsx`
- Modify: `apps/web/src/components/products/QCTab.tsx`
- Modify: `apps/web/src/components/products/PackagingTab.tsx`
- Modify: `apps/web/src/components/products/ProductDetailTabs.tsx`
- Modify: `apps/web/src/app/(dashboard)/products/[baseCode]/page.tsx`

**Interfaces:**
- Consumes: Task 2's 3 route (`/media/upload-url`, `/media`, `/media/[assetId]`).
- Produces: `<MediaUploader baseCode tab media mediaUrls onChanged />`, `<MediaGallery media mediaUrls />` — dùng lại nguyên xi ở Task 8 (trang phiên bản cũ, `MediaGallery` không cần sửa gì).

- [ ] **Bước 1: Mở rộng `get-product-detail.ts`**

```ts
import { prisma } from "@qc/db";

export async function getProductDetail(baseCode: string) {
  return prisma.product.findUnique({
    where: { baseCode },
    include: {
      category: true,
      currentVersion: {
        include: {
          tcsp: { include: { specRows: { orderBy: { sortOrder: "asc" } }, media: { orderBy: { sortOrder: "asc" } } } },
          qc: { include: { media: { orderBy: { sortOrder: "asc" } } } },
          packaging: { include: { media: { orderBy: { sortOrder: "asc" } } } },
          documents: { include: { files: { orderBy: { uploadedAt: "desc" } } } },
        },
      },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          changeLogs: { orderBy: { changedAt: "desc" } },
          tcsp: { include: { specRows: { orderBy: { sortOrder: "asc" } }, media: { orderBy: { sortOrder: "asc" } } } },
          qc: { include: { media: { orderBy: { sortOrder: "asc" } } } },
          packaging: { include: { media: { orderBy: { sortOrder: "asc" } } } },
          documents: { include: { files: { orderBy: { uploadedAt: "desc" } } } },
        },
      },
    },
  });
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductDetail>>>;
```

Đây là widening PURELY ADDITIVE giống pattern Task 7 (Plan 3a) — kiểm tra lại các consumer hiện có (`HistoryTab.tsx` chỉ đọc `changeLogs`/`versionNumber`/`isCurrent`/`createdAt`/`createdByAmisSync`, không đụng trường mới; fixture `ProductDetailTabs.test.tsx`'s `makeProduct()` set `tcsp: null` vẫn hợp lệ) — chạy `npm run test --workspace=apps/web` sau bước này để tự xác nhận không có gì vỡ trước khi đi tiếp.

- [ ] **Bước 2: `build-media-url-map.ts`**

```ts
import { getViewUrl } from "@qc/storage";
import type { ProductDetail } from "./get-product-detail";

type VersionWithMedia = NonNullable<ProductDetail["currentVersion"]> | ProductDetail["versions"][number];

/** Tạo map {id (MediaAsset hoặc ProductDocument) -> link GET đã ký} cho TOÀN BỘ media/tài liệu của 1
 * phiên bản — gọi 1 lần mỗi khi trang render (server-side), không lưu/cache lại ở đâu khác (spec §7). */
export async function buildMediaUrlMap(version: VersionWithMedia | null | undefined): Promise<Record<string, string>> {
  if (!version) return {};
  const items: { id: string; storageKey: string }[] = [
    ...(version.tcsp?.media ?? []),
    ...(version.qc?.media ?? []),
    ...(version.packaging?.media ?? []),
    ...(version.documents?.files ?? []),
  ];
  const entries = await Promise.all(items.map(async (item) => [item.id, await getViewUrl(item.storageKey)] as const));
  return Object.fromEntries(entries);
}
```

- [ ] **Bước 3: `MediaGallery.tsx` (chế độ xem, dùng chung mọi nơi kể cả Task 8)**

```tsx
interface MediaItem {
  id: string;
  mimeType: string;
  caption: string | null;
}

export function MediaGallery({ media, mediaUrls }: { media: MediaItem[]; mediaUrls: Record<string, string> }) {
  if (media.length === 0) return <p className="text-gray-400">Chưa có ảnh/video</p>;
  return (
    <div className="grid grid-cols-4 gap-2">
      {media.map((m) => (
        <div key={m.id} className="rounded border p-2 text-xs">
          {m.mimeType.startsWith("video/") ? (
            <video src={mediaUrls[m.id]} controls className="h-20 w-full rounded object-cover" />
          ) : (
            <img src={mediaUrls[m.id]} alt={m.caption ?? ""} className="h-20 w-full rounded object-cover" />
          )}
          {m.caption && <p className="mt-1">{m.caption}</p>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Bước 4: `MediaUploader.tsx` (chế độ sửa)**

```tsx
"use client";

import { useState } from "react";

interface MediaItem {
  id: string;
  storageKey: string;
  mimeType: string;
  caption: string | null;
  sortOrder: number;
}

export function MediaUploader({
  baseCode,
  tab,
  media,
  mediaUrls,
  onChanged,
}: {
  baseCode: string;
  tab: "tcsp" | "qc" | "packaging";
  media: MediaItem[];
  mediaUrls: Record<string, string>;
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // cho phép chọn lại đúng file đó lần sau
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const upRes = await fetch(`/api/products/${baseCode}/media/upload-url`, {
        method: "POST",
        body: JSON.stringify({ tab, fileName: file.name, mimeType: file.type, size: file.size }),
      });
      if (!upRes.ok) throw new Error((await upRes.json()).error ?? "Không xin được URL tải lên");
      const { uploadUrl, storageKey } = await upRes.json();

      // KHÔNG tự đặt header Content-Length — trình duyệt tự tính từ File/Blob, và giá trị đó phải
      // khớp size đã khai ở bước trên (chữ ký presigned URL đã ký cứng theo size đó).
      const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) throw new Error("Tải file lên thất bại");

      const createRes = await fetch(`/api/products/${baseCode}/media`, {
        method: "POST",
        body: JSON.stringify({ tab, storageKey, mimeType: file.type, caption: null, sortOrder: media.length }),
      });
      if (!createRes.ok) throw new Error("Lưu thông tin file thất bại");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(assetId: string) {
    if (!confirm("Xoá file này?")) return;
    const res = await fetch(`/api/products/${baseCode}/media/${assetId}`, { method: "DELETE" });
    if (res.ok) onChanged();
  }

  async function handleMove(assetId: string, direction: -1 | 1) {
    const idx = media.findIndex((m) => m.id === assetId);
    const swapWith = idx + direction;
    if (idx < 0 || swapWith < 0 || swapWith >= media.length) return;
    await Promise.all([
      fetch(`/api/products/${baseCode}/media/${media[idx].id}`, { method: "PATCH", body: JSON.stringify({ sortOrder: swapWith }) }),
      fetch(`/api/products/${baseCode}/media/${media[swapWith].id}`, { method: "PATCH", body: JSON.stringify({ sortOrder: idx }) }),
    ]);
    onChanged();
  }

  async function handleCaptionChange(assetId: string, caption: string) {
    await fetch(`/api/products/${baseCode}/media/${assetId}`, { method: "PATCH", body: JSON.stringify({ caption: caption || null }) });
  }

  return (
    <div className="space-y-2">
      <label className="inline-block cursor-pointer rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700">
        {uploading ? "Đang tải lên..." : "+ Chọn file"}
        <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" className="hidden" disabled={uploading} onChange={handleFileChange} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-4 gap-2">
        {media.map((m, i) => (
          <div key={m.id} className="rounded border p-2 text-xs">
            {m.mimeType.startsWith("video/") ? (
              <video src={mediaUrls[m.id]} controls className="h-20 w-full rounded object-cover" />
            ) : (
              <img src={mediaUrls[m.id]} alt={m.caption ?? ""} className="h-20 w-full rounded object-cover" />
            )}
            <input
              className="mt-1 w-full rounded border px-1 py-0.5 text-xs"
              placeholder="Chú thích"
              defaultValue={m.caption ?? ""}
              onBlur={(e) => handleCaptionChange(m.id, e.target.value)}
            />
            <div className="mt-1 flex justify-between text-gray-500">
              <span>
                <button onClick={() => handleMove(m.id, -1)} disabled={i === 0} aria-label="Lên">↑</button>{" "}
                <button onClick={() => handleMove(m.id, 1)} disabled={i === media.length - 1} aria-label="Xuống">↓</button>
              </span>
              <button onClick={() => handleDelete(m.id)} className="text-red-600">Xoá</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

`MediaUploader.test.tsx` — mock `global.fetch` (3 lệnh gọi tuần tự: upload-url → PUT → media), assert đúng thứ tự & payload, và `onChanged` được gọi sau khi cả 3 bước thành công; test riêng: nếu PUT thất bại thì KHÔNG gọi bước tạo MediaAsset (không tạo dòng DB trỏ vào file chưa thật sự tồn tại).

- [ ] **Bước 5: Nối vào TCSPTab/QCTab/PackagingTab**

Cả 3 tab thêm prop `mediaUrls: Record<string, string> = {}` (mặc định rỗng — test cũ không cần sửa), render `MediaGallery` ở chế độ xem và `MediaUploader` ở chế độ sửa, ngay dưới nội dung hiện có. Ví dụ `TCSPTab.tsx` (chỉ phần đổi, giữ nguyên toàn bộ phần còn lại của file):

```tsx
// thêm vào import
import { MediaGallery } from "./MediaGallery";
import { MediaUploader } from "./MediaUploader";

// đổi signature hàm
export function TCSPTab({
  product,
  editing,
  onDoneEditing,
  mediaUrls = {},
}: {
  product: ProductDetail;
  editing: boolean;
  onDoneEditing: () => void;
  mediaUrls?: Record<string, string>;
}) {
  // ... giữ nguyên toàn bộ phần state/handleSave/handleCancel hiện có ...

  // trong nhánh `if (!editing)`, thêm ngay trước `</div>` đóng khối chế độ xem:
  <MediaGallery media={tcsp?.media ?? []} mediaUrls={mediaUrls} />

  // trong nhánh chế độ sửa, thêm ngay trước khối nút Lưu/Huỷ:
  <MediaUploader baseCode={product.baseCode} tab="tcsp" media={tcsp?.media ?? []} mediaUrls={mediaUrls} onChanged={() => router.refresh()} />
```

Áp dụng đúng khuôn mẫu này cho `QCTab.tsx` (`tab="qc"`, `qc?.media`) và `PackagingTab.tsx` (`tab="packaging"`, `packaging?.media`).

- [ ] **Bước 6: Thread `mediaUrls` qua `ProductDetailTabs.tsx` và `page.tsx`**

`ProductDetailTabs.tsx` — thêm prop `mediaUrls: Record<string, string>` (bắt buộc, do component cha luôn có sẵn), truyền xuống 3 tab đã sửa:
```tsx
export function ProductDetailTabs({ product, role, mediaUrls }: { product: ProductDetail; role: UserRole; mediaUrls: Record<string, string> }) {
  // ...
  <TCSPTab product={product} editing={...} onDoneEditing={...} mediaUrls={mediaUrls} />
  <QCTab product={product} editing={...} onDoneEditing={...} mediaUrls={mediaUrls} />
  <PackagingTab product={product} editing={...} onDoneEditing={...} mediaUrls={mediaUrls} />
```

`page.tsx` (`/products/[baseCode]`):
```tsx
import { buildMediaUrlMap } from "@/lib/products/build-media-url-map";
// ...
const mediaUrls = await buildMediaUrlMap(product.currentVersion);
// ...
<ProductDetailTabs product={product} role={session.user.role} mediaUrls={mediaUrls} />
```

Cập nhật `ProductDetailTabs.test.tsx` — thêm `mediaUrls={{}}` vào 3 lệnh `render(<ProductDetailTabs ... />)` đã có (bắt buộc phải sửa vì prop này không có default ở component cha, khác với default `{}` ở từng tab con).

- [ ] **Bước 7: Chạy toàn bộ suite, xác nhận thủ công**

```bash
npm run test --workspace=apps/web
```

Xác nhận thủ công trên trình duyệt (dev server + MinIO đang chạy): mở 1 mã hàng thật → tab TCSP → Chỉnh sửa → chọn 1 ảnh nhỏ → thấy ảnh xuất hiện ngay trong lưới, có ô chú thích, nút xoá; thoát chỉnh sửa → ảnh vẫn hiện ở chế độ xem.

- [ ] **Bước 8: Commit**

```bash
git add apps/web/src/lib/products/get-product-detail.ts apps/web/src/lib/products/build-media-url-map.ts apps/web/src/components/products/MediaUploader.tsx apps/web/src/components/products/MediaUploader.test.tsx apps/web/src/components/products/MediaGallery.tsx apps/web/src/components/products/TCSPTab.tsx apps/web/src/components/products/QCTab.tsx apps/web/src/components/products/PackagingTab.tsx apps/web/src/components/products/ProductDetailTabs.tsx apps/web/src/components/products/ProductDetailTabs.test.tsx "apps/web/src/app/(dashboard)/products/[baseCode]/page.tsx"
git commit -m "feat(web): upload/xem ảnh video trong tab TCSP/QC/Đóng gói"
```

---

### Task 4: Tab Giấy tờ sản phẩm — thêm chế độ sửa (upload/xóa tài liệu)

**Files:**
- Create: `apps/web/src/app/api/products/[baseCode]/documents/upload-url/route.ts`
- Create: `apps/web/src/app/api/products/[baseCode]/documents/upload-url/route.test.ts`
- Create: `apps/web/src/app/api/products/[baseCode]/documents/route.ts`
- Create: `apps/web/src/app/api/products/[baseCode]/documents/route.test.ts`
- Create: `apps/web/src/app/api/products/[baseCode]/documents/[docId]/route.ts`
- Create: `apps/web/src/app/api/products/[baseCode]/documents/[docId]/route.test.ts`
- Modify: `apps/web/src/components/products/DocumentsTab.tsx`
- Create: `apps/web/src/components/products/DocumentsTab.test.tsx`
- Modify: `apps/web/src/components/products/ProductDetailTabs.tsx`

**Interfaces:**
- Consumes: `@qc/storage`, `assertRole`, `recordChanges` — giống hệt pattern Task 2.
- Produces: `<DocumentsTab product editing onDoneEditing mediaUrls />` (đổi signature — trước đây chỉ nhận `product`).

- [ ] **Bước 1: 3 route API (giống khuôn Task 2, đổi field: không có `tab`, thêm `kind`/`label`)**

`upload-url/route.ts` — giống hệt Task 2 bước 2 nhưng dùng `validateDocumentUpload` thay `validateMediaUpload`, body schema bỏ `tab`.

`documents/route.ts` (tạo `ProductDocument`):
```ts
const createSchema = z.object({
  storageKey: z.string().min(1),
  kind: z.enum(["COA", "MSDS", "ROHS", "OTHER"]),
  label: z.string().min(1),
});

// trong POST, sau khi assertRole + tìm product/currentVersionId:
const created = await prisma.$transaction(async (tx) => {
  const docsData = await tx.documentsData.upsert({ where: { versionId }, update: {}, create: { versionId } });
  const doc = await tx.productDocument.create({
    data: { documentsId: docsData.id, kind: parsed.data.kind, label: parsed.data.label, storageKey: parsed.data.storageKey },
  });
  await recordChanges(versionId, session.user.id, [{ fieldPath: "documents", oldValue: null, newValue: parsed.data.label }], tx);
  return doc;
});
return NextResponse.json({ id: created.id });
```

`[docId]/route.ts` (chỉ `DELETE` — không cần `PATCH`, spec không yêu cầu sửa lại phân loại/tên sau khi upload):
```ts
export async function DELETE(_req: Request, { params }: { params: { baseCode: string; docId: string } }) {
  // ...assertRole giống Task 2...
  const doc = await prisma.productDocument.findUnique({ where: { id: params.docId }, include: { documents: true } });
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });
  const version = await prisma.productVersion.findUnique({ where: { id: doc.documents.versionId }, include: { product: true } });
  if (!version || version.product.baseCode !== params.baseCode || version.product.currentVersionId !== version.id) {
    return NextResponse.json({ error: "Không tìm thấy hoặc không phải phiên bản hiện hành" }, { status: 404 });
  }
  await deleteObject(doc.storageKey);
  await prisma.$transaction(async (tx) => {
    await tx.productDocument.delete({ where: { id: params.docId } });
    await recordChanges(version.id, session.user.id, [{ fieldPath: "documents", oldValue: doc.label, newValue: null }], tx);
  });
  return NextResponse.json({ ok: true });
}
```

3 file test theo đúng khuôn Task 2 (403 QC_STAFF, MANAGER thành công + xác nhận DB/MinIO thật, xóa đúng thứ tự file→dòng DB).

- [ ] **Bước 2: `DocumentsTab.tsx` — thêm chế độ sửa**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VersionBanner } from "./VersionBanner";
import type { ProductDetail } from "@/lib/products/get-product-detail";

const KIND_LABELS: Record<string, string> = { COA: "COA", MSDS: "MSDS", ROHS: "Test ROHS", OTHER: "Khác" };
const KIND_OPTIONS = ["COA", "MSDS", "ROHS", "OTHER"] as const;

export function DocumentsTab({
  product,
  editing,
  onDoneEditing,
  mediaUrls = {},
}: {
  product: ProductDetail;
  editing: boolean;
  onDoneEditing: () => void;
  mediaUrls?: Record<string, string>;
}) {
  const router = useRouter();
  const version = product.currentVersion!;
  const files = version.documents?.files ?? [];
  const bannerVersion = { baseCode: product.baseCode, versionNumber: version.versionNumber, amisProductId: version.amisProductId, isCurrent: version.isCurrent };

  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState<(typeof KIND_OPTIONS)[number]>("COA");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!label.trim()) {
      setError("Nhập tên tài liệu trước khi chọn file.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const upRes = await fetch(`/api/products/${product.baseCode}/documents/upload-url`, {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, size: file.size }),
      });
      if (!upRes.ok) throw new Error((await upRes.json()).error ?? "Không xin được URL tải lên");
      const { uploadUrl, storageKey } = await upRes.json();

      const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) throw new Error("Tải file lên thất bại");

      const createRes = await fetch(`/api/products/${product.baseCode}/documents`, {
        method: "POST",
        body: JSON.stringify({ storageKey, kind, label: label.trim() }),
      });
      if (!createRes.ok) throw new Error("Lưu thông tin tài liệu thất bại");
      setLabel("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(docId: string) {
    if (!confirm("Xoá tài liệu này?")) return;
    const res = await fetch(`/api/products/${product.baseCode}/documents/${docId}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-3 text-sm">
      <VersionBanner version={bannerVersion} />
      {files.length === 0 ? (
        <p className="text-gray-400">Chưa có tài liệu nào</p>
      ) : (
        <ul className="divide-y rounded border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between p-2">
              <span>
                {KIND_LABELS[f.kind] ?? f.kind} — {f.label}
                {mediaUrls[f.id] && (
                  <a href={mediaUrls[f.id]} target="_blank" rel="noreferrer" className="ml-2 text-brand-600 hover:underline">
                    Tải xuống
                  </a>
                )}
              </span>
              {editing && <button onClick={() => handleDelete(f.id)} className="text-red-600">Xoá</button>}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        // Khác TCSP/QC/Đóng gói: mỗi upload/xóa ở đây là 1 hành động lưu ngay lập tức, không có
        // buffer/"Lưu"/"Huỷ" gộp — nên nút thoát chỉ đơn giản là "Xong", không cần reset state.
        <div className="space-y-2 rounded border p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              Loại tài liệu
              <select className="mt-1 w-full rounded border px-2 py-1" value={kind} onChange={(e) => setKind(e.target.value as (typeof KIND_OPTIONS)[number])}>
                {KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>{KIND_LABELS[k]}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Tên tài liệu
              <input className="mt-1 w-full rounded border px-2 py-1" value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
          </div>
          <label className="inline-block cursor-pointer rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700">
            {uploading ? "Đang tải lên..." : "+ Chọn file"}
            <input type="file" className="hidden" disabled={uploading} onChange={handleFileChange} />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <button onClick={onDoneEditing} className="rounded border px-4 py-1.5 text-sm hover:bg-gray-50">Xong</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

`DocumentsTab.test.tsx` — mock `next/navigation` (giống `ProductDetailTabs.test.tsx`), mock `global.fetch`; test: chế độ xem không hiện nút Xoá; chế độ sửa bấm chọn file khi chưa nhập tên tài liệu → báo lỗi, không gọi fetch; nhập tên rồi chọn file → gọi đủ 3 fetch đúng thứ tự.

- [ ] **Bước 3: Nối vào `ProductDetailTabs.tsx`**

```tsx
const editableTabs: TabName[] = ["Tiêu chuẩn sản phẩm", "QC sản phẩm", "Quy cách đóng gói", "Giấy tờ sản phẩm"];
// ...
{activeTab === "Giấy tờ sản phẩm" && (
  <DocumentsTab product={product} editing={editing && activeTab === "Giấy tờ sản phẩm"} onDoneEditing={() => setEditing(false)} mediaUrls={mediaUrls} />
)}
```

Xác nhận `ProductDetailTabs.test.tsx` hiện có (3 test) vẫn PASS không cần sửa gì thêm — không test nào giả định "Giấy tờ sản phẩm" không có nút Chỉnh sửa cụ thể (chỉ test "Lịch sử phiên bản", tab đó vẫn không đổi).

- [ ] **Bước 4: Chạy toàn bộ suite, commit**

```bash
npm run test --workspace=apps/web
git add apps/web/src/app/api/products/\[baseCode\]/documents apps/web/src/components/products/DocumentsTab.tsx apps/web/src/components/products/DocumentsTab.test.tsx apps/web/src/components/products/ProductDetailTabs.tsx
git commit -m "feat(web): tab Giấy tờ sản phẩm — thêm upload/xóa tài liệu"
```

---

### Task 5: Kế thừa media qua phiên bản mới (sync-worker) — sửa `cloneVersionContent`

**Files:**
- Modify: `apps/worker/src/sync/upsert-product.ts`
- Modify: `apps/worker/package.json`
- Create/Modify: `apps/worker/src/sync/upsert-product.test.ts` (thêm test case vào file đã có)

**Interfaces:**
- Consumes: `@qc/storage`'s `buildStorageKey`/`copyObject` (Task 1) nguyên xi.
- Produces: không đổi chữ ký public `upsertProductFromAmis` — chỉ sửa nội bộ `cloneVersionContent`.

- [ ] **Bước 1: Thêm dependency, viết test TRƯỚC (đòi hỏi MinIO thật đang chạy)**

`apps/worker/package.json` — thêm vào `dependencies`: `"@qc/storage": "*"`.

Mở `apps/worker/src/sync/upsert-product.test.ts`, thêm test case (giữ nguyên toàn bộ test có sẵn):

```ts
import { buildStorageKey, getUploadUrl, getViewUrl, deleteObject, ensureBucketExists } from "@qc/storage";

// (thêm vào describe() đã có, hoặc describe riêng cùng file)
it("kế thừa media sang phiên bản mới bằng file ĐỘC LẬP — xóa media ở bản mới không ảnh hưởng bản cũ", async () => {
  await ensureBucketExists();
  const baseCode = `MEDCLONE${Date.now()}`;
  const product = await prisma.product.create({ data: { baseCode, amisProductId: `amis-${baseCode}`, status: "PENDING_QC" } });
  const v1 = await prisma.productVersion.create({
    data: { productId: product.id, versionNumber: 1, amisProductId: `amis-v1-${baseCode}`, name: "Bản 1", isCurrent: true },
  });
  await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: v1.id } });

  const tcsp = await prisma.tCSPData.create({ data: { versionId: v1.id, description: "Mô tả gốc" } });
  const originalKey = buildStorageKey(baseCode, v1.id, "anh-goc.jpg");
  const content = Buffer.from("noi dung anh goc");
  const uploadUrl = await getUploadUrl({ storageKey: originalKey, mimeType: "image/jpeg", size: content.length });
  await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg", "Content-Length": String(content.length) }, body: content });
  await prisma.mediaAsset.create({ data: { storageKey: originalKey, mimeType: "image/jpeg", sortOrder: 0, tcspId: tcsp.id } });

  // Kích hoạt tạo phiên bản mới (.2) kế thừa nội dung + media từ v1.
  await upsertProductFromAmis({ amisProductId: `amis-v2-${baseCode}`, code: `${baseCode}.2`, name: "Bản 2", description: null });

  const v2 = await prisma.productVersion.findUnique({ where: { amisProductId: `amis-v2-${baseCode}` }, include: { tcsp: { include: { media: true } } } });
  expect(v2?.tcsp?.media).toHaveLength(1);
  const newKey = v2!.tcsp!.media[0].storageKey;
  expect(newKey).not.toBe(originalKey); // file ĐỘC LẬP, không dùng chung storageKey

  // Xóa media của bản MỚI (giả lập người dùng xóa ảnh ở phiên bản hiện hành) — bản GỐC (v1, chỉ đọc)
  // phải còn nguyên. Đây chính là kịch bản xung đột spec §7 mô tả (kế thừa + xóa hẳn file).
  await deleteObject(newKey);
  const originalStillThere = await fetch(await getViewUrl(originalKey));
  expect(originalStillThere.ok).toBe(true);

  await deleteObject(originalKey);
  await prisma.productVersion.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });
});
```

Chạy: `npm run test --workspace=apps/worker` → FAIL (media hiện dùng chung storageKey, hoặc `v2.tcsp.media` rỗng nếu copy chưa implement).

- [ ] **Bước 2: Sửa `cloneVersionContent`**

Trong `apps/worker/src/sync/upsert-product.ts`, thêm import và 2 hàm helper phía trên `cloneVersionContent`:

```ts
import { copyObject, buildStorageKey } from "@qc/storage";
import { logger } from "../logger";

/** Trích tên file gốc từ storageKey (dạng products/<baseCode>/<versionId>/<uuid>-<tênfile>) để giữ
 * nguyên tên khi sinh storageKey mới cho phiên bản kế thừa. */
function extractFileName(storageKey: string): string {
  const lastSegment = storageKey.split("/").pop() ?? storageKey;
  const dashIndex = lastSegment.indexOf("-");
  return dashIndex >= 0 ? lastSegment.slice(dashIndex + 1) : lastSegment;
}

/** Sao chép 1 file MinIO sang storageKey mới độc lập cho phiên bản mới (xem spec §7 — mỗi phiên bản
 * phải sở hữu file riêng, không dùng chung storageKey, vì media bị xóa hẳn khi người dùng xóa).
 * Lỗi copy 1 file KHÔNG được làm hỏng cả lần đồng bộ — trả `null`, bên gọi bỏ qua đúng file đó. */
async function copyMediaFile(baseCode: string, toVersionId: string, oldStorageKey: string): Promise<string | null> {
  const newKey = buildStorageKey(baseCode, toVersionId, extractFileName(oldStorageKey));
  try {
    await copyObject(oldStorageKey, newKey);
    return newKey;
  } catch (err) {
    logger.warn(`Không sao chép được file ${oldStorageKey} sang phiên bản mới — bỏ qua, giữ lại các file khác:`, err);
    return null;
  }
}
```

Sửa chữ ký `cloneVersionContent` thêm tham số `baseCode`, và sửa 4 vòng lặp media/document để copy trước khi tạo dòng DB:

```ts
async function cloneVersionContent(tx: PrismaTransactionClient, fromVersionId: string, toVersionId: string, baseCode: string) {
  const [tcsp, qc, packaging, documents] = await Promise.all([/* không đổi */]);

  if (tcsp) {
    const newTcsp = await tx.tCSPData.create({ data: { /* không đổi */ } });
    for (const row of tcsp.specRows) { /* không đổi */ }
    for (const media of tcsp.media) {
      const newKey = await copyMediaFile(baseCode, toVersionId, media.storageKey);
      if (newKey) {
        await tx.mediaAsset.create({
          data: { storageKey: newKey, mimeType: media.mimeType, caption: media.caption, sortOrder: media.sortOrder, tcspId: newTcsp.id },
        });
      }
    }
  }

  if (qc) {
    const newQc = await tx.qCData.create({ data: { /* không đổi */ } });
    for (const media of qc.media) {
      const newKey = await copyMediaFile(baseCode, toVersionId, media.storageKey);
      if (newKey) {
        await tx.mediaAsset.create({
          data: { storageKey: newKey, mimeType: media.mimeType, caption: media.caption, sortOrder: media.sortOrder, qcId: newQc.id },
        });
      }
    }
  }

  if (packaging) {
    const newPackaging = await tx.packagingData.create({ data: { /* không đổi */ } });
    for (const media of packaging.media) {
      const newKey = await copyMediaFile(baseCode, toVersionId, media.storageKey);
      if (newKey) {
        await tx.mediaAsset.create({
          data: { storageKey: newKey, mimeType: media.mimeType, caption: media.caption, sortOrder: media.sortOrder, packagingId: newPackaging.id },
        });
      }
    }
  }

  if (documents) {
    const newDocuments = await tx.documentsData.create({ data: { versionId: toVersionId } });
    for (const file of documents.files) {
      const newKey = await copyMediaFile(baseCode, toVersionId, file.storageKey);
      if (newKey) {
        await tx.productDocument.create({ data: { documentsId: newDocuments.id, kind: file.kind, label: file.label, storageKey: newKey } });
      }
    }
  }
}
```

Sửa lời gọi (dòng ~161) thêm `existingBase.baseCode`, và tăng timeout transaction (thêm network call MinIO vào trong transaction):
```ts
await cloneVersionContent(tx, currentVersion.id, newVersion.id, existingBase.baseCode);
// ...
{ timeout: 20000 } // tăng từ 10000 — CopyObject thêm network call vào trong transaction
```

Chạy: `npm run test --workspace=apps/worker` → PASS (test mới + toàn bộ test cũ, xác nhận không có regression trên logic version-detection/dedup đã fix ở AMIS-sync plan).

- [ ] **Bước 3: Commit**

```bash
git add apps/worker/src/sync/upsert-product.ts apps/worker/src/sync/upsert-product.test.ts apps/worker/package.json
git commit -m "fix(worker): kế thừa media bằng file MinIO độc lập mỗi phiên bản (CopyObject)"
```

---

### Task 6: File mẫu TCSP + logic dựng workbook Excel động

**Files:**
- Create: `scripts/build-tcsp-template.js`
- Create: `assets/templates/tcsp-template.xlsx` (sản phẩm của script trên, commit dạng binary)
- Create: `apps/web/src/lib/tcsp-export/build-workbook.ts`
- Create: `apps/web/src/lib/tcsp-export/build-workbook.test.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces: `buildTcspWorkbook(input: TcspExportInput): Promise<Buffer>` — dùng ở Task 7.

**Bối cảnh đã khảo sát thật (2026-09-11):** file gốc `TCSP HOÀNG GIA.xlsx` (đường dẫn trên máy hiện tại: `C:\Users\Administrator\Downloads\TCSP HOÀNG GIA.xlsx`) có 4 sheet: 1 sheet "Specification" ẩn (không dùng), 3 sheet "TCSP Hàng Mã AA & ST"/"SB"/"SI" cấu trúc GIỐNG HỆT nhau (chỉ khác dữ liệu ví dụ). Layout sheet (giữ nguyên tọa độ dưới đây khi dựng template sạch):
- `A1:G1` (merge) = tên công ty; `A2:G2` (merge) = "BẢNG TIÊU CHUẨN SẢN PHẨM".
- `A3` = "Mã:", `B3` = giá trị mã; `C3` = "Tên: ", `D3` = giá trị tên (không merge, tự tràn sang ô trống bên phải nếu dài).
- `A4:G4` (merge) = vùng "Ảnh/Market" — có 1 ảnh thật được neo (anchor) tại đây trong file gốc, dùng làm mẫu vị trí chèn ảnh.
- `A5` = "Mô tả", `B5:G5` (merge) = giá trị mô tả.
- `A6` = "Mã NL (nếu có)", `B6:G6` (merge) = giá trị mã NL.
- `A7:G7` = header bảng thông số: "Tiêu chuẩn" | "Tiêu chí" (`B7:C7` merge) | "Thông số"(D) | "D/sai "(E) | "Đơn vị"(F) | "Ghi chú"(G).
- Từ dòng 8: mỗi dòng dữ liệu — cột A = nhóm (`groupName`, merge dọc theo số dòng của nhóm đó), `B:C` merge = tiêu chí, D = thông số, E = dung sai, F = đơn vị, G = ghi chú.
- Dòng chân trang (ngay sau dòng trống cách 1 dòng): `A` = "Người lập: ", giá trị ở `B`; `D` = "Người duyệt:", giá trị ở `E`; `G` = "Ngày duyệt", giá trị ở `H` (suy luận từ vị trí liền kề nhãn — **xác nhận lại bằng mắt khi mở file kết quả ở Bước 3, chỉnh lệch 1 cột nếu cần, chi phí sai rất nhỏ**).

- [ ] **Bước 1: Script dựng file mẫu sạch**

`scripts/build-tcsp-template.js`:
```js
// Chạy 1 LẦN để tạo assets/templates/tcsp-template.xlsx từ file gốc thật của công ty.
// Cách chạy: node scripts/build-tcsp-template.js "C:\Users\Administrator\Downloads\TCSP HOÀNG GIA.xlsx"
const ExcelJS = require("exceljs");
const path = require("path");

async function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) {
    console.error("Cách dùng: node scripts/build-tcsp-template.js <đường dẫn file TCSP HOÀNG GIA.xlsx gốc>");
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(sourcePath);

  // Chỉ giữ lại sheet "TCSP Hàng mã SI" (cấu trúc giống hệt 2 sheet còn lại + sheet ẩn — xác nhận
  // 2026-09-11) — xóa các sheet khác, đổi tên sheet còn lại thành "TCSP" (dùng chung mọi mã hàng).
  const keep = wb.getWorksheet("TCSP Hàng mã SI");
  for (const sheet of [...wb.worksheets]) {
    if (sheet !== keep) wb.removeWorksheet(sheet.id);
  }
  keep.name = "TCSP";

  // Xóa dữ liệu ví dụ thật của khách hàng (SI06526), GIỮ NGUYÊN style/border/merge.
  keep.getCell("B3").value = null;
  keep.getCell("D3").value = null;
  keep.getCell("B5").value = null;
  keep.getCell("B6").value = null;
  for (let row = 8; row <= 16; row++) {
    for (const col of ["A", "B", "D", "E", "F", "G"]) {
      keep.getCell(`${col}${row}`).value = null;
    }
  }

  // Xóa ảnh thật của khách hàng đã nhúng sẵn (giữ lại vùng neo A4:G4 trống để build-workbook.ts
  // chèn ảnh thật của sản phẩm vào đúng vị trí này khi xuất).
  const images = keep.getImages();
  for (const img of images) {
    wb.media.splice(wb.media.findIndex((m) => m.name === img.imageId), 1);
  }
  keep.model.media = [];

  const outPath = path.resolve(__dirname, "../assets/templates/tcsp-template.xlsx");
  await wb.xlsx.writeFile(outPath);
  console.log("Đã ghi:", outPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Chạy (dùng đường dẫn file gốc thật trên máy hiện tại):
```bash
mkdir -p assets/templates
node scripts/build-tcsp-template.js "C:\Users\Administrator\Downloads\TCSP HOÀNG GIA.xlsx"
```

- [ ] **Bước 2: Xác nhận thủ công file mẫu sạch**

Mở lại `assets/templates/tcsp-template.xlsx` (bằng Excel hoặc lại dùng `exceljs` đọc + in ra console): xác nhận chỉ còn 1 sheet tên "TCSP", không còn text "SI06526"/"SB0954"/"AA04063" hay mô tả sản phẩm ví dụ nào, dòng 7 (header bảng) còn nguyên, các ô merge còn nguyên, không còn ảnh nhúng.

- [ ] **Bước 3: `build-workbook.ts` — viết test TRƯỚC**

```ts
// apps/web/src/lib/tcsp-export/build-workbook.test.ts
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildTcspWorkbook } from "./build-workbook";

function baseInput() {
  return {
    baseCode: "SI99999",
    versionNumber: 3,
    name: "Nhãn test",
    materialCode: "NL-001",
    description: "Mô tả test",
    preparedBy: "Nguyễn Văn A",
    approvedBy: "Trần Thị B",
    approvedAt: new Date("2026-01-15"),
    specRows: [
      { groupName: "Kích thước", criterion: "Chiều dài", value: "150", tolerance: "± 1", unit: "mm", note: "" },
      { groupName: "Kích thước", criterion: "Chiều rộng", value: "100", tolerance: "± 1", unit: "mm", note: "" },
      { groupName: "TC khác", criterion: "Đóng gói", value: "Tiêu chuẩn", tolerance: "", unit: "", note: "" },
    ],
    imageBuffer: null as Buffer | null,
  };
}

async function readBack(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.getWorksheet("TCSP")!;
}

describe("buildTcspWorkbook", () => {
  it("điền đúng các ô cố định và đúng số dòng thông số (3 dòng, khác mẫu ví dụ 9 dòng)", async () => {
    const buffer = await buildTcspWorkbook(baseInput());
    const sheet = await readBack(buffer);
    expect(sheet.getCell("B3").value).toBe("SI99999.3");
    expect(sheet.getCell("D3").value).toBe("Nhãn test");
    expect(sheet.getCell("B5").value).toBe("Mô tả test");
    expect(sheet.getCell("B6").value).toBe("NL-001");
    expect(sheet.getCell("A8").value).toBe("Kích thước");
    expect(sheet.getCell("B8").value).toBe("Chiều dài");
    expect(sheet.getCell("A10").value).toBe("TC khác");
    expect(sheet.getCell("B10").value).toBe("Đóng gói");
  });

  it("co giãn đúng khi số dòng NHIỀU HƠN mẫu ví dụ (12 dòng)", async () => {
    const input = baseInput();
    input.specRows = Array.from({ length: 12 }, (_, i) => ({
      groupName: i < 5 ? "Kích thước" : "TC khác",
      criterion: `Tiêu chí ${i}`,
      value: String(i),
      tolerance: "",
      unit: "",
      note: "",
    }));
    const buffer = await buildTcspWorkbook(input);
    const sheet = await readBack(buffer);
    expect(sheet.getCell("B8").value).toBe("Tiêu chí 0");
    expect(sheet.getCell("B19").value).toBe("Tiêu chí 11"); // dòng 8 + 11 = 19, dòng cuối
    expect(sheet.getCell("A8").value).toBe("Kích thước");
    expect(sheet.getCell("A13").value).toBe("TC khác");
  });

  it("footer Người lập/duyệt/ngày dịch đúng theo số dòng thông số", async () => {
    const buffer = await buildTcspWorkbook(baseInput()); // 3 dòng thông số
    const sheet = await readBack(buffer);
    // 3 dòng thông số bắt đầu dòng 8 -> kết thúc dòng 10, cách 1 dòng trống -> footer dòng 12.
    expect(sheet.getCell("B12").value).toBe("Nguyễn Văn A");
    expect(sheet.getCell("E12").value).toBe("Trần Thị B");
  });

  it("không có specRows vẫn xuất được, không lỗi", async () => {
    const input = baseInput();
    input.specRows = [];
    const buffer = await buildTcspWorkbook(input);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
```

Chạy → FAIL (chưa có `build-workbook.ts`).

- [ ] **Bước 4: Viết `build-workbook.ts`**

```ts
import ExcelJS from "exceljs";
import path from "node:path";

const TEMPLATE_PATH = path.resolve(process.cwd(), "assets/templates/tcsp-template.xlsx");
const HEADER_ROW = 7;
const FIRST_DATA_ROW = 8;

export interface TcspExportSpecRow {
  groupName: string;
  criterion: string;
  value: string;
  tolerance: string | null;
  unit: string | null;
  note: string | null;
}

export interface TcspExportInput {
  baseCode: string;
  versionNumber: number;
  name: string;
  materialCode: string | null;
  description: string | null;
  preparedBy: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  specRows: TcspExportSpecRow[];
  imageBuffer: Buffer | null; // ảnh đầu tiên (sortOrder nhỏ nhất) của tab TCSP, nếu có
}

export async function buildTcspWorkbook(input: TcspExportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);
  const sheet = wb.getWorksheet("TCSP")!;

  sheet.getCell("B3").value = `${input.baseCode}.${input.versionNumber}`;
  sheet.getCell("D3").value = input.name;
  sheet.getCell("B5").value = input.description ?? "";
  sheet.getCell("B6").value = input.materialCode ?? "";

  if (input.imageBuffer) {
    const imageId = wb.addImage({ buffer: input.imageBuffer, extension: "jpeg" });
    sheet.addImage(imageId, { tl: { col: 1, row: 3 }, br: { col: 6, row: 4 }, editAs: "oneCell" });
  }

  const rowCount = input.specRows.length;
  if (rowCount > 1) {
    // Dòng 8 (FIRST_DATA_ROW) đã có sẵn style trong template — nhân bản style đó cho các dòng dữ
    // liệu còn lại, chèn ngay sau dòng 8 (đẩy dòng trống + chân trang xuống theo).
    sheet.duplicateRow(FIRST_DATA_ROW, rowCount - 1, true);
  }

  let currentGroup: string | null = null;
  let groupStartRow = FIRST_DATA_ROW;
  input.specRows.forEach((row, i) => {
    const r = FIRST_DATA_ROW + i;
    sheet.getCell(`B${r}`).value = row.criterion;
    sheet.getCell(`D${r}`).value = row.value;
    sheet.getCell(`E${r}`).value = row.tolerance ?? "";
    sheet.getCell(`F${r}`).value = row.unit ?? "";
    sheet.getCell(`G${r}`).value = row.note ?? "";

    if (row.groupName !== currentGroup) {
      if (currentGroup !== null && r - 1 >= groupStartRow) {
        sheet.mergeCells(`A${groupStartRow}:A${r - 1}`);
      }
      currentGroup = row.groupName;
      groupStartRow = r;
      sheet.getCell(`A${r}`).value = row.groupName;
    }
  });
  if (currentGroup !== null) {
    const lastRow = FIRST_DATA_ROW + rowCount - 1;
    if (lastRow >= groupStartRow) sheet.mergeCells(`A${groupStartRow}:A${lastRow}`);
  }

  // Chân trang cách 1 dòng trống sau dòng dữ liệu cuối cùng (khớp layout gốc: dòng 16 dữ liệu cuối,
  // dòng 17 trống, dòng 18 chân trang — offset +2 tính từ dòng dữ liệu cuối).
  const footerRow = FIRST_DATA_ROW + Math.max(rowCount, 1) - 1 + 2;
  sheet.getCell(`B${footerRow}`).value = input.preparedBy ?? "";
  sheet.getCell(`E${footerRow}`).value = input.approvedBy ?? "";
  sheet.getCell(`H${footerRow}`).value = input.approvedAt ? input.approvedAt.toLocaleDateString("vi-VN") : "";

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
```

Chạy test → PASS (nếu lệch tọa độ chân trang/nhóm merge, đây chính là chỗ TDD tự lộ ra lệch bao nhiêu dòng/cột — sửa `FIRST_DATA_ROW`/offset chân trang cho khớp, không cần đoán trước).

- [ ] **Bước 5: Thêm `exceljs`, chạy toàn bộ suite, commit**

`apps/web/package.json` — thêm vào `dependencies`: `"exceljs": "^4.4.0"`.

```bash
npm install
npm run test --workspace=apps/web -- build-workbook
git add scripts/build-tcsp-template.js assets/templates/tcsp-template.xlsx apps/web/src/lib/tcsp-export apps/web/package.json package-lock.json
git commit -m "feat(web): file mẫu TCSP sạch + logic dựng workbook Excel động"
```

---

### Task 7: API xuất TCSP + nút "Tải TCSP"

**Files:**
- Create: `apps/web/src/app/api/products/[baseCode]/tcsp/export/route.ts`
- Create: `apps/web/src/app/api/products/[baseCode]/tcsp/export/route.test.ts`
- Modify: `apps/web/src/components/products/TCSPTab.tsx`

**Interfaces:**
- Consumes: `buildTcspWorkbook` (Task 6).
- Produces: `GET /api/products/[baseCode]/tcsp/export?version=N` (bỏ `version` = phiên bản hiện hành).

- [ ] **Bước 1: Viết test trước**

```ts
import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { prisma, UserRole } from "@qc/db";
import ExcelJS from "exceljs";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
import { GET } from "./route";

const baseCode = `TCSPXP${Date.now()}`;

describe("/api/products/[baseCode]/tcsp/export", () => {
  beforeAll(async () => {
    const product = await prisma.product.create({ data: { baseCode, amisProductId: `amis-${baseCode}`, status: "PENDING_QC" } });
    const version = await prisma.productVersion.create({
      data: { productId: product.id, versionNumber: 1, amisProductId: `amis-v-${baseCode}`, name: "Test export" },
    });
    await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: version.id } });
    await prisma.tCSPData.create({ data: { versionId: version.id, description: "Mô tả xuất thử", materialCode: "NL-X" } });
  });

  it("trả 403 khi chưa đăng nhập", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request(`http://localhost/api/products/${baseCode}/tcsp/export`), { params: { baseCode } });
    expect(res.status).toBe(403);
  });

  it("QC_STAFF vẫn tải được (quyền đọc/xuất, không giới hạn như quyền sửa)", async () => {
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1", username: "qc", fullName: "QC", role: UserRole.QC_STAFF } });
    const res = await GET(new Request(`http://localhost/api/products/${baseCode}/tcsp/export`), { params: { baseCode } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml");

    const buffer = Buffer.from(await res.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.getWorksheet("TCSP")!;
    expect(sheet.getCell("B6").value).toBe("NL-X");
  });

  afterAll(async () => {
    await prisma.productVersion.deleteMany({ where: { product: { baseCode } } });
    await prisma.product.deleteMany({ where: { baseCode } });
    await prisma.$disconnect();
  });
});
```

Chạy → FAIL.

- [ ] **Bước 2: Viết route**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@qc/db";
import { auth } from "@/lib/auth";
import { buildTcspWorkbook } from "@/lib/tcsp-export/build-workbook";
import { getViewUrl } from "@qc/storage";

export async function GET(req: Request, { params }: { params: { baseCode: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Không đủ quyền truy cập" }, { status: 403 });

  const product = await prisma.product.findUnique({
    where: { baseCode: params.baseCode },
    include: {
      currentVersion: { include: { tcsp: { include: { specRows: { orderBy: { sortOrder: "asc" } }, media: { orderBy: { sortOrder: "asc" }, take: 1 } } } } },
      versions: {
        include: { tcsp: { include: { specRows: { orderBy: { sortOrder: "asc" } }, media: { orderBy: { sortOrder: "asc" }, take: 1 } } } },
      },
    },
  });
  if (!product) return NextResponse.json({ error: "Không tìm thấy mã hàng" }, { status: 404 });

  const requestedVersion = new URL(req.url).searchParams.get("version");
  const version = requestedVersion
    ? product.versions.find((v) => v.versionNumber === Number(requestedVersion))
    : product.currentVersion;
  if (!version) return NextResponse.json({ error: "Không tìm thấy phiên bản" }, { status: 404 });

  const firstMedia = version.tcsp?.media[0];
  let imageBuffer: Buffer | null = null;
  if (firstMedia) {
    const url = await getViewUrl(firstMedia.storageKey);
    const res = await fetch(url);
    if (res.ok) imageBuffer = Buffer.from(await res.arrayBuffer());
  }

  const buffer = await buildTcspWorkbook({
    baseCode: product.baseCode,
    versionNumber: version.versionNumber,
    name: version.name,
    materialCode: version.tcsp?.materialCode ?? null,
    description: version.tcsp?.description ?? null,
    preparedBy: version.tcsp?.preparedBy ?? null,
    approvedBy: version.tcsp?.approvedBy ?? null,
    approvedAt: version.tcsp?.approvedAt ?? null,
    specRows: version.tcsp?.specRows ?? [],
    imageBuffer,
  });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="TCSP-${product.baseCode}.${version.versionNumber}.xlsx"`,
    },
  });
}
```

Chạy test → PASS.

- [ ] **Bước 3: Nút "Tải TCSP" ở `TCSPTab.tsx` (chế độ xem)**

Trong nhánh `if (!editing)` của `TCSPTab.tsx`, thêm ngay dưới `VersionBanner`:
```tsx
<a
  href={`/api/products/${product.baseCode}/tcsp/export`}
  className="inline-block rounded border border-brand-600 px-3 py-1 text-sm text-brand-600 hover:bg-brand-50"
>
  Tải TCSP (.xlsx)
</a>
```

- [ ] **Bước 4: Chạy toàn bộ suite, commit**

```bash
npm run test --workspace=apps/web
git add "apps/web/src/app/api/products/[baseCode]/tcsp/export" apps/web/src/components/products/TCSPTab.tsx
git commit -m "feat(web): API xuất TCSP Excel + nút Tải TCSP"
```

---

### Task 8: Mở rộng trang phiên bản cũ — đầy đủ nội dung + media + nút Tải TCSP

**Files:**
- Modify: `apps/web/src/components/products/TCSPTab.tsx`
- Modify: `apps/web/src/components/products/QCTab.tsx`
- Modify: `apps/web/src/components/products/PackagingTab.tsx`
- Modify: `apps/web/src/app/(dashboard)/products/[baseCode]/v/[versionNumber]/page.tsx`

**Interfaces:**
- Consumes: `TCSPTab`/`QCTab`/`PackagingTab` (Task 3), `MediaGallery` (Task 3), `buildMediaUrlMap` (Task 3), route xuất Task 7 (qua query `?version=`).

Việc còn treo từ Plan 3a (trang phiên bản cũ chỉ hiện 3/10 trường) gộp sửa ở đây — trang mới tái dùng nguyên 3 component tab thay vì mã hand-rolled riêng.

- [ ] **Bước 1: Cho `TCSPTab`/`QCTab`/`PackagingTab` nhận phiên bản TÙY CHỌN (mặc định `product.currentVersion`)**

3 tab hiện đọc cứng `product.currentVersion!` — thêm prop `version` tùy chọn để trang phiên bản cũ truyền vào đúng bản đang xem, không phải viết lại UI. Ví dụ `TCSPTab.tsx` (đổi 2 dòng đầu hàm, giữ nguyên toàn bộ phần còn lại):

```tsx
export function TCSPTab({
  product,
  editing,
  onDoneEditing,
  mediaUrls = {},
  version: versionOverride,
}: {
  product: ProductDetail;
  editing: boolean;
  onDoneEditing: () => void;
  mediaUrls?: Record<string, string>;
  version?: NonNullable<ProductDetail["currentVersion"]>;
}) {
  const router = useRouter();
  const version = versionOverride ?? product.currentVersion!;
  // ... toàn bộ phần còn lại giữ nguyên, không đổi ...
```

Áp dụng đúng khuôn cho `QCTab.tsx`/`PackagingTab.tsx`.

- [ ] **Bước 2: Viết lại `page.tsx` trang phiên bản cũ**

```tsx
import { notFound } from "next/navigation";
import { getProductDetail } from "@/lib/products/get-product-detail";
import { buildMediaUrlMap } from "@/lib/products/build-media-url-map";
import { VersionBanner } from "@/components/products/VersionBanner";
import { TCSPTab } from "@/components/products/TCSPTab";
import { QCTab } from "@/components/products/QCTab";
import { PackagingTab } from "@/components/products/PackagingTab";
import { MediaGallery } from "@/components/products/MediaGallery";

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

  const mediaUrls = await buildMediaUrlMap(version);
  const noop = () => {};

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">
        {product.baseCode}.{version.versionNumber} — {version.name}
      </h1>
      <p className="mb-4 text-sm text-gray-500">Xem lại phiên bản cũ — không sửa được.</p>
      <a
        href={`/api/products/${product.baseCode}/tcsp/export?version=${version.versionNumber}`}
        className="mb-4 inline-block rounded border border-brand-600 px-3 py-1 text-sm text-brand-600 hover:bg-brand-50"
      >
        Tải TCSP (.xlsx)
      </a>

      <div className="mt-4 space-y-6 text-sm">
        <section>
          <h2 className="mb-2 font-medium">Tiêu chuẩn sản phẩm</h2>
          <TCSPTab product={product} version={version} editing={false} onDoneEditing={noop} mediaUrls={mediaUrls} />
        </section>
        <section>
          <h2 className="mb-2 font-medium">QC sản phẩm</h2>
          <QCTab product={product} version={version} editing={false} onDoneEditing={noop} mediaUrls={mediaUrls} />
        </section>
        <section>
          <h2 className="mb-2 font-medium">Quy cách đóng gói</h2>
          <PackagingTab product={product} version={version} editing={false} onDoneEditing={noop} mediaUrls={mediaUrls} />
        </section>
        <section>
          <h2 className="mb-2 font-medium">Giấy tờ sản phẩm</h2>
          <VersionBanner version={{ baseCode: product.baseCode, versionNumber: version.versionNumber, amisProductId: version.amisProductId, isCurrent: version.isCurrent }} />
          <MediaGallery media={version.documents?.files ?? []} mediaUrls={mediaUrls} />
        </section>
      </div>
    </div>
  );
}
```

Mỗi `<section>` sẽ hiện `VersionBanner` LẶP LẠI 3 lần (từ 3 tab con) + 1 lần thủ công cho Giấy tờ — chấp nhận được cho v1 (đơn giản, tái dùng tối đa; nếu sau này thấy rối mắt, dễ sửa gọn 1 banner chung ở đầu trang, không phải việc phải làm ngay).

`editing={false}` đảm bảo cả 3 tab chỉ render nhánh chế độ xem (không có form sửa, không có nút Lưu/Huỷ, không có `MediaUploader` — vì `if (!editing)` return sớm trong cả 3 component, không đụng tới nhánh sửa).

- [ ] **Bước 3: Xác nhận thủ công + chạy toàn bộ suite**

Chạy `npm run test --workspace=apps/web` (không cần test mới riêng cho trang này — 3 tab con đã có test đầy đủ, trang chỉ lắp ráp lại chúng ở `editing=false`, tương tự lý do Task 5 Plan 3a từng chấp nhận "manual check đủ" cho 1 trang lắp ráp thuần).

Xác nhận thủ công trên trình duyệt: mở 1 mã hàng có ≥ 2 phiên bản, vào `/products/<mã>/v/<số cũ>` — thấy đầy đủ bảng thông số TCSP (không phải chỉ mô tả), QC/Đóng gói đủ trường lưu ý/lỗi thường gặp, ảnh/tài liệu (nếu có), nút Tải TCSP tải đúng file của phiên bản đó (không phải bản hiện hành) — không có nút Chỉnh sửa/Lưu/Huỷ/Xoá ở đâu trên trang.

- [ ] **Bước 4: Commit**

```bash
git add apps/web/src/components/products/TCSPTab.tsx apps/web/src/components/products/QCTab.tsx apps/web/src/components/products/PackagingTab.tsx "apps/web/src/app/(dashboard)/products/[baseCode]/v/[versionNumber]/page.tsx"
git commit -m "feat(web): trang phiên bản cũ — đầy đủ nội dung + media + Tải TCSP (đóng việc treo từ Plan 3a)"
```

---

## Sau khi cả 8 task xong

Chạy `npm test` (root, cả apps/web + apps/worker) + `npm run build` (root, cả 3 package/app) xanh toàn bộ trước khi chuyển sang final review toàn nhánh — theo đúng quy trình đã dùng ở Plan 3a (dispatch reviewer model opus review toàn bộ diff, rồi mới `finishing-a-development-branch`).
