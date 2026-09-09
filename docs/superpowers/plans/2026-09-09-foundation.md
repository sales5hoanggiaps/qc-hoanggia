# QC Hoàng Gia — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the qc-hoanggia monorepo with its full database schema, a working 3-tier login/permission system, and the two admin panels (user accounts, category taxonomy) that don't depend on AMIS data — a deployable, testable slice with no placeholder content.

**Architecture:** Next.js 14 App Router monorepo (`apps/web` + `packages/db`), mirroring the proven stack and auth pattern already in production at `hoanggia-crm` (NextAuth v5 Credentials provider, bcryptjs, Prisma/PostgreSQL, Tailwind). `apps/worker` (AMIS sync) is intentionally out of scope — it lands in the next plan once this foundation runs.

**Tech Stack:** TypeScript 5.6, Next.js 14.2.13, next-auth 5.0.0-beta.20, Prisma 5.20.0 + PostgreSQL, bcryptjs 2.4.3, Tailwind CSS 3.4.11, Zod 3.23.8, Vitest 2.1.1, Node >=20.

**Spec:** [docs/superpowers/specs/2026-09-09-qc-hoanggia-design.md](../specs/2026-09-09-qc-hoanggia-design.md)

## Global Constraints

- Dự án hoàn toàn độc lập với `hoanggia-crm`: repo riêng, database riêng, tài khoản đăng nhập riêng (spec §1).
- App này **không bao giờ** có chức năng tạo mã hàng (`Product`) hay phiên bản (`ProductVersion`) mới qua UI/API — những bản ghi đó chỉ được tạo bởi tiến trình đồng bộ AMIS ở plan sau (spec §3, §5). Không viết bất kỳ "Tạo mã hàng"/"Tạo phiên bản" endpoint nào trong plan này.
- 3 vai trò: `QC_STAFF` (chỉ đọc), `MANAGER` ("Quản trị viên" — mọi quyền nội dung, không quản lý tài khoản), `ADMIN` (mọi quyền + quản lý tài khoản) (spec §5).
- Mật khẩu băm bằng bcryptjs; không có đăng ký công khai — chỉ ADMIN tạo tài khoản (spec §5).
- `.env` chứa secret thật không commit git; `.env.example` commit làm mẫu.
- Giao diện người dùng bằng tiếng Việt (nội bộ công ty Việt Nam), theo đúng văn phong đã dùng ở `hoanggia-crm`.
- Node >= 20 (theo `engines` của `hoanggia-crm`).

---

## File Structure

```
qc-hoanggia/
  package.json                          # workspaces root
  tsconfig.base.json
  infra/
    docker-compose.yml                  # postgres (Task 2), + web/nginx (Task 9)
    .env.example                        # đã có
    .env                                # đã có (gitignored)
  packages/
    db/
      package.json
      tsconfig.json
      prisma/
        schema.prisma                   # Task 2
        seed.ts                         # Task 3
      src/
        index.ts                       # Prisma client singleton + re-exports
  apps/
    web/
      package.json
      next.config.js
      tailwind.config.ts
      postcss.config.js
      tsconfig.json
      vitest.config.ts
      src/
        app/
          layout.tsx
          globals.css
          login/
            page.tsx                    # Task 4
          (dashboard)/
            layout.tsx                  # Task 6
            page.tsx                    # placeholder home (Task 6)
            admin/
              users/page.tsx            # Task 7
              categories/page.tsx       # Task 8
          api/
            auth/[...nextauth]/route.ts # Task 4
            admin/
              users/route.ts            # Task 7
              users/[id]/route.ts       # Task 7
              categories/route.ts       # Task 8
              categories/[id]/route.ts  # Task 8
        lib/
          format.ts                     # Task 1 (sanity)
          auth.ts                       # Task 4 (NextAuth config + verifyCredentials)
          auth/
            guard.ts                    # Task 5 (assertRole, ForbiddenError)
          db.ts                         # Task 2 (re-export from @qc/db)
        middleware.ts                   # Task 5
        components/
          nav/DashboardNav.tsx          # Task 6
```

---

### Task 1: Monorepo scaffold + Next.js app + testing pipeline

**Files:**
- Create: `package.json` (root)
- Create: `tsconfig.base.json`
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.js`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/lib/format.ts`
- Test: `apps/web/src/lib/format.test.ts`

**Interfaces:**
- Produces: `formatVersionLabel(baseCode: string, versionNumber: number): string` — used by later plans (content/detail pages) to render `"<baseCode>.<n>"` (spec §2 versioning convention). Establishing it now, with a test, gives the pipeline something real to prove itself on.

- [ ] **Step 1: Write root `package.json`**

```json
{
  "name": "qc-hoanggia",
  "private": true,
  "version": "0.1.0",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "postinstall": "node -e \"if(require('fs').existsSync('packages/db/src')){require('child_process').execSync('npm run build --workspace=packages/db',{stdio:'inherit'})}\"",
    "dev": "npm run dev --workspace=apps/web",
    "build": "npm run build --workspace=packages/db && npm run build --workspace=apps/web",
    "lint": "npm run lint --workspace=apps/web",
    "test": "npm run test --workspace=apps/web",
    "prisma:generate": "npm run generate --workspace=packages/db",
    "prisma:migrate": "npm run migrate:dev --workspace=packages/db",
    "prisma:studio": "npm run studio --workspace=packages/db",
    "db:seed": "npm run seed --workspace=packages/db"
  },
  "engines": { "node": ">=20.0.0" }
}
```

- [ ] **Step 2: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 3: Scaffold `apps/web/package.json`**

```json
{
  "name": "@qc/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "next": "^14.2.13",
    "next-auth": "5.0.0-beta.20",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.1",
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^20.16.5",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "eslint": "^8.57.1",
    "eslint-config-next": "^14.2.13",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.11",
    "typescript": "^5.6.2",
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 4: Write `apps/web/next.config.js`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
};

module.exports = nextConfig;
```

- [ ] **Step 5: Write `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "noEmit": true,
    "incremental": true,
    "isolatedModules": true,
    "allowJs": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 6: Write `apps/web/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff6ff",
          600: "#2563eb",
          700: "#1d4ed8",
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 7: Write `apps/web/postcss.config.js`**

```js
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 8: Write `apps/web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

- [ ] **Step 9: Write `apps/web/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 10: Write `apps/web/src/app/layout.tsx`**

```tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "QC Hoàng Gia",
  description: "Hệ thống tra cứu tiêu chuẩn sản phẩm & QC — Hoàng Gia",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
```

- [ ] **Step 11: Write placeholder `apps/web/src/app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-gray-500">QC Hoàng Gia — đang khởi tạo.</p>
    </main>
  );
}
```

- [ ] **Step 12: Write the failing test for `formatVersionLabel`**

```ts
// apps/web/src/lib/format.test.ts
import { describe, expect, it } from "vitest";
import { formatVersionLabel } from "./format";

describe("formatVersionLabel", () => {
  it("nối mã gốc và số phiên bản bằng dấu chấm", () => {
    expect(formatVersionLabel("SI08694", 1)).toBe("SI08694.1");
    expect(formatVersionLabel("SI08694", 12)).toBe("SI08694.12");
  });
});
```

- [ ] **Step 13: Run test to verify it fails**

Run: `npm run test --workspace=apps/web`
Expected: FAIL — `Cannot find module './format'` (file doesn't exist yet).

- [ ] **Step 14: Implement `formatVersionLabel`**

```ts
// apps/web/src/lib/format.ts
export function formatVersionLabel(baseCode: string, versionNumber: number): string {
  return `${baseCode}.${versionNumber}`;
}
```

- [ ] **Step 15: Run test to verify it passes**

Run: `npm run test --workspace=apps/web`
Expected: PASS (1 test)

- [ ] **Step 16: Install dependencies and verify the app boots**

Run: `npm install` (from repo root), then `npm run dev`
Expected: Next.js dev server starts on port 3000; visiting `/` shows "QC Hoàng Gia — đang khởi tạo."

- [ ] **Step 17: Commit**

```bash
git add package.json tsconfig.base.json apps/web
git commit -m "chore: scaffold Next.js app + testing pipeline"
```

---

### Task 2: Prisma schema + local Postgres (packages/db)

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/index.ts`
- Create: `infra/docker-compose.yml`
- Modify: `apps/web/package.json` (add the `@qc/db` workspace dependency — deliberately left out of Task 1 since nothing there used it yet, and listing it before `packages/db` existed would break `npm install`)
- Test: `apps/web/src/lib/db.integration.test.ts`

**Interfaces:**
- Produces: `prisma` (singleton `PrismaClient` instance), and re-exported enums `UserRole`, `ProductStatus`, `DocumentKind` — all imported as `import { prisma, UserRole } from "@qc/db"` by every later task.
- Consumes: `DATABASE_URL` env var (already present, empty, in `infra/.env` — must be filled in Step 1 below for local dev).

- [ ] **Step 1: Start local Postgres and set `DATABASE_URL`**

Write `infra/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: qc
      POSTGRES_PASSWORD: qc_dev_password
      POSTGRES_DB: qc_hoanggia
    ports:
      - "5433:5432"
    volumes:
      - qc_postgres_data:/var/lib/postgresql/data

volumes:
  qc_postgres_data:
```

Run: `docker compose -f infra/docker-compose.yml up -d postgres`

Then edit `infra/.env` (already gitignored), set:

```
DATABASE_URL=postgresql://qc:qc_dev_password@localhost:5433/qc_hoanggia
```

`infra/.env.example` already has an empty `DATABASE_URL=` line (written during brainstorming) — fill in a placeholder value there too (`postgresql://user:password@localhost:5432/qc_hoanggia`) so the file stays a safe template; don't duplicate the line.

- [ ] **Step 2: Write `packages/db/package.json`**

```json
{
  "name": "@qc/db",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "prisma generate && tsc -p tsconfig.json",
    "generate": "prisma generate",
    "migrate:dev": "prisma migrate dev",
    "migrate:deploy": "prisma migrate deploy",
    "studio": "prisma studio",
    "seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.20.0"
  },
  "devDependencies": {
    "bcryptjs": "^2.4.3",
    "prisma": "^5.20.0",
    "tsx": "^4.19.1",
    "typescript": "^5.6.2"
  },
  "prisma": { "seed": "tsx prisma/seed.ts" }
}
```

- [ ] **Step 3: Write `packages/db/tsconfig.json`**

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

- [ ] **Step 4: Write the full schema — `packages/db/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  QC_STAFF
  MANAGER
  ADMIN
}

enum ProductStatus {
  ACTIVE
  PENDING_QC
  DISCONTINUED
}

enum DocumentKind {
  COA
  MSDS
  ROHS
  OTHER
}

model User {
  id           String   @id @default(cuid())
  fullName     String
  username     String   @unique
  passwordHash String
  role         UserRole
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
}

model Category {
  id       String    @id @default(cuid())
  name     String    @unique
  products Product[]
}

model Customer {
  id             String            @id @default(cuid())
  amisCustomerId String            @unique
  name           String
  products       ProductCustomer[]
}

model Product {
  id               String           @id @default(cuid())
  baseCode         String           @unique
  amisProductId    String           @unique
  categoryId       String?
  category         Category?        @relation(fields: [categoryId], references: [id])
  status           ProductStatus    @default(PENDING_QC)
  currentVersionId String?          @unique
  currentVersion   ProductVersion?  @relation("CurrentVersion", fields: [currentVersionId], references: [id])
  versions         ProductVersion[] @relation("AllVersions")
  customers        ProductCustomer[]
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt
}

model ProductCustomer {
  productId     String
  customerId    String
  lastOrderDate DateTime?
  product       Product  @relation(fields: [productId], references: [id])
  customer      Customer @relation(fields: [customerId], references: [id])

  @@id([productId, customerId])
}

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
  createdAt         DateTime @default(now())

  tcsp       TCSPData?
  qc         QCData?
  packaging  PackagingData?
  documents  DocumentsData?
  changeLogs ChangeLogEntry[]

  @@unique([productId, versionNumber])
}

model TCSPData {
  id           String         @id @default(cuid())
  versionId    String         @unique
  version      ProductVersion @relation(fields: [versionId], references: [id])
  materialCode String?
  description  String?
  preparedBy   String?
  approvedBy   String?
  approvedAt   DateTime?
  specRows     TCSPSpecRow[]
  media        MediaAsset[]
}

model TCSPSpecRow {
  id        String   @id @default(cuid())
  tcspId    String
  tcsp      TCSPData @relation(fields: [tcspId], references: [id])
  groupName String
  criterion String
  value     String
  tolerance String?
  unit      String?
  note      String?
  sortOrder Int      @default(0)
}

model QCData {
  id           String         @id @default(cuid())
  versionId    String         @unique
  version      ProductVersion @relation(fields: [versionId], references: [id])
  checklist    String?
  knownDefects String?
  specialNotes String?
  media        MediaAsset[]
}

model PackagingData {
  id           String         @id @default(cuid())
  versionId    String         @unique
  version      ProductVersion @relation(fields: [versionId], references: [id])
  instructions String?
  specialNotes String?
  media        MediaAsset[]
}

model DocumentsData {
  id        String            @id @default(cuid())
  versionId String            @unique
  version   ProductVersion    @relation(fields: [versionId], references: [id])
  files     ProductDocument[]
}

model ProductDocument {
  id          String        @id @default(cuid())
  documentsId String
  documents   DocumentsData @relation(fields: [documentsId], references: [id])
  kind        DocumentKind
  label       String
  storageKey  String
  uploadedAt  DateTime      @default(now())
}

model MediaAsset {
  id          String @id @default(cuid())
  storageKey  String
  mimeType    String
  caption     String?
  sortOrder   Int     @default(0)

  tcspId      String?
  tcsp        TCSPData?      @relation(fields: [tcspId], references: [id])
  qcId        String?
  qc          QCData?        @relation(fields: [qcId], references: [id])
  packagingId String?
  packaging   PackagingData? @relation(fields: [packagingId], references: [id])
}

model ChangeLogEntry {
  id        String         @id @default(cuid())
  versionId String
  version   ProductVersion @relation(fields: [versionId], references: [id])
  fieldPath String
  oldValue  String?
  newValue  String?
  changedBy String?
  changedAt DateTime       @default(now())
  source    String
}

model SyncLog {
  id            String    @id @default(cuid())
  startedAt     DateTime  @default(now())
  finishedAt    DateTime?
  newProducts   Int       @default(0)
  updatedLinks  Int       @default(0)
  newVersions   Int       @default(0)
  flaggedReview Int       @default(0)
  errorMessage  String?
}
```

- [ ] **Step 5: Write `packages/db/src/index.ts`**

```ts
import { PrismaClient, UserRole, ProductStatus, DocumentKind } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { UserRole, ProductStatus, DocumentKind };
export type {
  User,
  Category,
  Customer,
  Product,
  ProductVersion,
  TCSPData,
  TCSPSpecRow,
  QCData,
  PackagingData,
  DocumentsData,
  ProductDocument,
  MediaAsset,
  ChangeLogEntry,
  SyncLog,
} from "@prisma/client";
```

- [ ] **Step 6: Wire `@qc/db` into `apps/web`, generate client, run the migration**

Task 1 deliberately left `@qc/db` out of `apps/web/package.json` (it didn't exist yet). Add it now — open `apps/web/package.json` and add `"@qc/db": "*"` as the first entry under `dependencies`, alongside the existing `bcryptjs`/`next`/etc. entries.

Then run (from repo root):
```bash
npm install
npm run prisma:migrate -- --name init
```
Expected: `npm install` links `@qc/db` as a local workspace package, then triggers the root `postinstall` script, which runs `npm run build --workspace=packages/db` (`prisma generate && tsc`) — this is what makes `dist/index.js` exist so anything importing `"@qc/db"` (the test below, `apps/web` at dev/build time) can resolve it; without this compiled output, the import fails even though the source file exists. `prisma migrate dev` then prompts for a migration name if not passed inline, creates `packages/db/prisma/migrations/<timestamp>_init/migration.sql`, and applies it to the running Postgres container — Prisma's own CLI re-runs `prisma generate` as part of this, so the client stays in sync with the schema.

**Remember:** any later task that edits `packages/db/src/index.ts` or `schema.prisma` must re-run `npm run build --workspace=packages/db` (or `npm install` again) before its tests can see the change — there is no watch mode wired up in this plan.

- [ ] **Step 7: Write the failing integration test**

```ts
// apps/web/src/lib/db.integration.test.ts
import { describe, expect, it, afterAll } from "vitest";
import { prisma } from "@qc/db";

describe("@qc/db round-trip", () => {
  it("tạo và đọc lại 1 Category", async () => {
    const created = await prisma.category.create({ data: { name: "Tem nhãn (test)" } });
    const found = await prisma.category.findUnique({ where: { id: created.id } });
    expect(found?.name).toBe("Tem nhãn (test)");
    await prisma.category.delete({ where: { id: created.id } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
```

This test can't fail meaningfully "before implementation" since Step 6 already created the schema — the failing state to verify here is environmental: run it **before** `DATABASE_URL` is set correctly to confirm it fails loudly rather than silently passing against the wrong database.

- [ ] **Step 8: Run test to verify it passes against the local Postgres**

Run: `npm run test --workspace=apps/web`
Expected: PASS — confirms `@qc/db` resolves, the migration applied, and `DATABASE_URL` points at the right container.

- [ ] **Step 9: Commit**

```bash
git add packages/db infra/docker-compose.yml infra/.env.example apps/web/package.json apps/web/src/lib/db.integration.test.ts
git commit -m "feat(db): add full Prisma schema and local Postgres compose"
```

---

### Task 3: Seed script

**Files:**
- Create: `packages/db/prisma/seed.ts`
- Test: `apps/web/src/lib/seed.integration.test.ts`

**Interfaces:**
- Consumes: `prisma`, `UserRole` from `@qc/db` (Task 2).
- Produces: guarantees a `User` with `username: "admin"`, `role: ADMIN` exists after seeding — every later auth task assumes this account is available for manual login testing.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/seed.integration.test.ts
import { describe, expect, it, afterAll } from "vitest";
import { prisma, UserRole } from "@qc/db";

describe("seed data", () => {
  it("có tài khoản admin và 3 danh mục mẫu sau khi seed", async () => {
    const admin = await prisma.user.findUnique({ where: { username: "admin" } });
    expect(admin?.role).toBe(UserRole.ADMIN);
    expect(admin?.isActive).toBe(true);

    const categoryCount = await prisma.category.count();
    expect(categoryCount).toBeGreaterThanOrEqual(3);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/web`
Expected: FAIL — no `admin` user exists yet.

- [ ] **Step 3: Write `packages/db/prisma/seed.ts`**

```ts
import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("DoiMatKhauNgay!2026", 10);

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      fullName: "Quản trị hệ thống",
      username: "admin",
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  const categories = ["Tem nhãn", "Túi", "Hộp", "Cuộn màng PE"];
  for (const name of categories) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 4: Run the seed script**

Run: `npm run db:seed`
Expected: logs nothing on success (or prints nothing); exits 0.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=apps/web`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/seed.ts apps/web/src/lib/seed.integration.test.ts
git commit -m "feat(db): add seed script (admin user + sample categories)"
```

---

### Task 4: NextAuth (Credentials, username-based) + Login page

**Files:**
- Create: `apps/web/src/lib/auth.ts`
- Create: `apps/web/src/app/api/auth/[...nextauth]/route.ts`
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/types/next-auth.d.ts`
- Test: `apps/web/src/lib/auth.test.ts`

**Interfaces:**
- Produces: `verifyCredentials(username: string, password: string): Promise<AuthUser | null>` where `AuthUser = { id: string; username: string; fullName: string; role: UserRole }` — this is what Task 5's `assertRole` and Task 6's nav consume via `session.user`.
- Produces: `{ handlers, auth, signIn, signOut }` exported from `lib/auth.ts` (NextAuth v5 pattern, same as `hoanggia-crm/apps/web/src/lib/auth.ts`).
- Consumes: `prisma` from `@qc/db` (Task 2).

- [ ] **Step 1: Write the failing test for `verifyCredentials`**

```ts
// apps/web/src/lib/auth.test.ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { prisma, UserRole } from "@qc/db";
import { verifyCredentials } from "./auth";

describe("verifyCredentials", () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("mat-khau-dung", 10);
    await prisma.user.create({
      data: {
        fullName: "Nhân viên QC Test",
        username: "qc.test",
        passwordHash,
        role: UserRole.QC_STAFF,
        isActive: true,
      },
    });
    await prisma.user.create({
      data: {
        fullName: "Tài khoản đã khoá",
        username: "khoa.test",
        passwordHash,
        role: UserRole.QC_STAFF,
        isActive: false,
      },
    });
  });

  it("trả về user khi username/mật khẩu đúng và tài khoản đang hoạt động", async () => {
    const user = await verifyCredentials("qc.test", "mat-khau-dung");
    expect(user).toMatchObject({ username: "qc.test", role: UserRole.QC_STAFF });
  });

  it("trả về null khi sai mật khẩu", async () => {
    expect(await verifyCredentials("qc.test", "sai-mat-khau")).toBeNull();
  });

  it("trả về null khi username không tồn tại", async () => {
    expect(await verifyCredentials("khong-ton-tai", "bat-ky")).toBeNull();
  });

  it("trả về null khi tài khoản bị khoá (isActive = false)", async () => {
    expect(await verifyCredentials("khoa.test", "mat-khau-dung")).toBeNull();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: { in: ["qc.test", "khoa.test"] } } });
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/web`
Expected: FAIL — `verifyCredentials` is not exported (module doesn't exist yet).

- [ ] **Step 3: Write `apps/web/src/lib/auth.ts`**

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma, UserRole } from "@qc/db";

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
}

export async function verifyCredentials(
  username: string,
  password: string
): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.isActive) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  return { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Chạy sau reverse proxy (Traefik/Nginx), không phải Vercel — như hoanggia-crm.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Tên đăng nhập", type: "text" },
        password: { label: "Mật khẩu", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!username || !password) return null;
        return verifyCredentials(username, password);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as AuthUser).id;
        token.username = (user as AuthUser).username;
        token.fullName = (user as AuthUser).fullName;
        token.role = (user as AuthUser).role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.username = token.username as string;
      session.user.fullName = token.fullName as string;
      session.user.role = token.role as UserRole;
      return session;
    },
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/web`
Expected: PASS (4 tests)

- [ ] **Step 5: Declare NextAuth session type augmentation**

```ts
// apps/web/src/types/next-auth.d.ts
import { UserRole } from "@qc/db";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      fullName: string;
      role: UserRole;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    fullName: string;
    role: UserRole;
  }
}
```

- [ ] **Step 6: Write the NextAuth route handler**

NextAuth v5 exports a single `handlers` object (not `GET`/`POST` directly) — destructure it:

```ts
// apps/web/src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 7: Write the login page**

```tsx
// apps/web/src/app/login/page.tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await signIn("credentials", { username, password, redirect: false });
    setSubmitting(false);
    if (result?.error) {
      setError("Sai tên đăng nhập hoặc mật khẩu.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Đăng nhập QC Hoàng Gia</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-1">
          <label className="text-sm font-medium">Tên đăng nhập</label>
          <input
            className="w-full rounded border px-3 py-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Mật khẩu</label>
          <input
            type="password"
            className="w-full rounded border px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-brand-600 py-2 text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 8: Confirm `AUTH_SECRET` is set**

`infra/.env.example` (`AUTH_SECRET=`) and `infra/.env` (with a real generated value) already have this — it replaced an earlier placeholder named `SESSION_SECRET` once NextAuth v5's actual expected variable name was confirmed. Just verify `infra/.env` has a non-empty `AUTH_SECRET`; regenerate with `openssl rand -base64 32` only if it's missing.

- [ ] **Step 9: Manual verification**

Run: `npm run dev`, visit `/login`, sign in with `admin` / `DoiMatKhauNgay!2026` (seeded in Task 3).
Expected: redirected to `/` without error.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/auth.ts apps/web/src/lib/auth.test.ts apps/web/src/app/api/auth apps/web/src/app/login apps/web/src/types/next-auth.d.ts infra/.env.example
git commit -m "feat(auth): NextAuth credentials login (username-based)"
```

---

### Task 5: Route protection (middleware) + role guard

**Files:**
- Create: `apps/web/src/middleware.ts`
- Create: `apps/web/src/lib/auth/guard.ts`
- Test: `apps/web/src/lib/auth/guard.test.ts`

**Interfaces:**
- Consumes: `UserRole` from `@qc/db`, `AuthUser` from `@/lib/auth` (Task 4).
- Produces: `assertRole(role: UserRole | undefined, allowed: UserRole[]): void` (throws `ForbiddenError`) and `ForbiddenError` class — every admin API route in Tasks 7–8 calls this first.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/auth/guard.test.ts
import { describe, expect, it } from "vitest";
import { UserRole } from "@qc/db";
import { assertRole, ForbiddenError } from "./guard";

describe("assertRole", () => {
  it("không ném lỗi khi vai trò nằm trong danh sách cho phép", () => {
    expect(() => assertRole(UserRole.ADMIN, [UserRole.ADMIN, UserRole.MANAGER])).not.toThrow();
  });

  it("ném ForbiddenError khi vai trò không được phép", () => {
    expect(() => assertRole(UserRole.QC_STAFF, [UserRole.ADMIN])).toThrow(ForbiddenError);
  });

  it("ném ForbiddenError khi không có vai trò (chưa đăng nhập)", () => {
    expect(() => assertRole(undefined, [UserRole.ADMIN])).toThrow(ForbiddenError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/web`
Expected: FAIL — module `./guard` doesn't exist.

- [ ] **Step 3: Write `apps/web/src/lib/auth/guard.ts`**

```ts
import { UserRole } from "@qc/db";

export class ForbiddenError extends Error {
  constructor(message = "Không đủ quyền truy cập") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function assertRole(role: UserRole | undefined, allowed: UserRole[]): void {
  if (!role || !allowed.includes(role)) {
    throw new ForbiddenError();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/web`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the middleware**

```ts
// apps/web/src/middleware.ts
export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
```

NextAuth v5's `auth` export doubles as middleware: it redirects unauthenticated requests matching the pattern to `/login` automatically because `pages.signIn` is set (Task 4, Step 3).

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, open an incognito window, visit `/` directly.
Expected: redirected to `/login` (no session cookie).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/middleware.ts apps/web/src/lib/auth/guard.ts apps/web/src/lib/auth/guard.test.ts
git commit -m "feat(auth): protect all routes by default + assertRole guard"
```

---

### Task 6: Dashboard shell + role-based navigation

**Files:**
- Create: `apps/web/src/components/nav/DashboardNav.tsx`
- Create: `apps/web/src/app/(dashboard)/layout.tsx`
- Move: `apps/web/src/app/page.tsx` → `apps/web/src/app/(dashboard)/page.tsx`
- Test: `apps/web/src/components/nav/DashboardNav.test.tsx`

**Interfaces:**
- Consumes: `UserRole` from `@qc/db`.
- Produces: `<DashboardNav role={UserRole} />` — a pure presentational component other pages don't need to know the internals of, only that it takes a `role` prop.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/nav/DashboardNav.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserRole } from "@qc/db";
import { DashboardNav } from "./DashboardNav";

describe("DashboardNav", () => {
  it("QC_STAFF chỉ thấy Tìm kiếm và Danh sách mã hàng", () => {
    render(<DashboardNav role={UserRole.QC_STAFF} />);
    expect(screen.getByText("Tìm kiếm")).toBeInTheDocument();
    expect(screen.getByText("Danh sách mã hàng")).toBeInTheDocument();
    expect(screen.queryByText("Quản trị viên")).not.toBeInTheDocument();
    expect(screen.queryByText("Tài khoản")).not.toBeInTheDocument();
  });

  it("MANAGER thấy thêm mục Quản trị viên nhưng không thấy Tài khoản", () => {
    render(<DashboardNav role={UserRole.MANAGER} />);
    expect(screen.getByText("Quản trị viên")).toBeInTheDocument();
    expect(screen.queryByText("Tài khoản")).not.toBeInTheDocument();
  });

  it("ADMIN thấy đầy đủ mọi mục kể cả Tài khoản", () => {
    render(<DashboardNav role={UserRole.ADMIN} />);
    expect(screen.getByText("Quản trị viên")).toBeInTheDocument();
    expect(screen.getByText("Tài khoản")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/web`
Expected: FAIL — module `./DashboardNav` doesn't exist.

- [ ] **Step 3: Write `apps/web/src/components/nav/DashboardNav.tsx`**

```tsx
import Link from "next/link";
import { UserRole } from "@qc/db";

export function DashboardNav({ role }: { role: UserRole }) {
  const canManageContent = role === UserRole.MANAGER || role === UserRole.ADMIN;

  return (
    <nav className="flex flex-col gap-1 p-4 text-sm">
      <Link href="/" className="rounded px-3 py-2 hover:bg-gray-100">
        Tìm kiếm
      </Link>
      <Link href="/danh-sach" className="rounded px-3 py-2 hover:bg-gray-100">
        Danh sách mã hàng
      </Link>
      {canManageContent && (
        <Link href="/admin/categories" className="rounded px-3 py-2 hover:bg-gray-100">
          Quản trị viên
        </Link>
      )}
      {role === UserRole.ADMIN && (
        <Link href="/admin/users" className="rounded px-3 py-2 hover:bg-gray-100">
          Tài khoản
        </Link>
      )}
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/web`
Expected: PASS (3 tests)

- [ ] **Step 5: Create the `(dashboard)` route group and move the home page**

Create `apps/web/src/app/(dashboard)/layout.tsx`:

```tsx
import { auth } from "@/lib/auth";
import { DashboardNav } from "@/components/nav/DashboardNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = session!.user.role; // middleware (Task 5) guarantees a session here

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r bg-white">
        <DashboardNav role={role} />
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}
```

Move `apps/web/src/app/page.tsx` to `apps/web/src/app/(dashboard)/page.tsx` (route groups don't add a URL segment, so `/` still resolves here):

```tsx
// apps/web/src/app/(dashboard)/page.tsx
export default function HomePage() {
  return (
    <main className="p-6">
      <h1 className="text-lg font-semibold">Tìm kiếm mã hàng</h1>
      <p className="mt-2 text-sm text-gray-500">
        Chức năng tìm kiếm sẽ được bổ sung ở giai đoạn tiếp theo.
      </p>
    </main>
  );
}
```

Delete the old `apps/web/src/app/page.tsx`.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, log in as `admin`.
Expected: sidebar shows Tìm kiếm, Danh sách mã hàng, Quản trị viên, Tài khoản; page body shows the "Tìm kiếm mã hàng" placeholder.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/nav apps/web/src/app/\(dashboard\)
git rm apps/web/src/app/page.tsx
git commit -m "feat(ui): dashboard shell with role-based navigation"
```

---

### Task 7: User management (Admin-only CRUD)

**Files:**
- Create: `apps/web/src/app/api/admin/users/route.ts`
- Create: `apps/web/src/app/api/admin/users/[id]/route.ts`
- Create: `apps/web/src/app/(dashboard)/admin/users/page.tsx`
- Create: `apps/web/src/components/admin/UsersPanel.tsx`
- Test: `apps/web/src/app/api/admin/users/route.test.ts`

**Interfaces:**
- Consumes: `assertRole`, `ForbiddenError` (Task 5); `prisma`, `UserRole` (Task 2); `auth` (Task 4).
- Produces: `GET/POST /api/admin/users`, `PATCH /api/admin/users/[id]` — no other task depends on these directly, but they establish the request/response shape (`{ id, fullName, username, role, isActive }`) reused conceptually by Task 8's category endpoints.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/api/admin/users/route.test.ts
import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";
import { prisma, UserRole } from "@qc/db";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));
import { auth } from "@/lib/auth";
import { GET, POST } from "./route";

function mockSession(role: UserRole | null) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    role ? { user: { id: "u1", username: "test", fullName: "Test", role } } : null
  );
}

describe("/api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET trả 403 khi người gọi không phải ADMIN", async () => {
    mockSession(UserRole.MANAGER);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("GET trả danh sách user khi là ADMIN", async () => {
    mockSession(UserRole.ADMIN);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.users)).toBe(true);
  });

  it("POST tạo user mới với role QC_STAFF khi là ADMIN", async () => {
    mockSession(UserRole.ADMIN);
    const req = new Request("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        fullName: "Nhân viên Test 2",
        username: "test2.qc",
        tempPassword: "TamThoi123!",
        role: "QC_STAFF",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.username).toBe("test2.qc");
    expect(body.user).not.toHaveProperty("passwordHash");
  });

  it("POST trả 403 khi người gọi không phải ADMIN", async () => {
    mockSession(UserRole.QC_STAFF);
    const req = new Request("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        fullName: "X",
        username: "x",
        tempPassword: "12345678",
        role: "QC_STAFF",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: "test2.qc" } });
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/web`
Expected: FAIL — `./route` doesn't exist.

- [ ] **Step 3: Write `apps/web/src/app/api/admin/users/route.ts`**

```ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";

const createUserSchema = z.object({
  fullName: z.string().min(1),
  username: z.string().min(3),
  tempPassword: z.string().min(8),
  role: z.enum([UserRole.QC_STAFF, UserRole.MANAGER]),
});

export async function GET() {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const users = await prisma.user.findMany({
    select: { id: true, fullName: true, username: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const parsed = createUserSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.tempPassword, 10);
  const user = await prisma.user.create({
    data: {
      fullName: parsed.data.fullName,
      username: parsed.data.username,
      role: parsed.data.role,
      passwordHash,
    },
    select: { id: true, fullName: true, username: true, role: true, isActive: true, createdAt: true },
  });

  return NextResponse.json({ user }, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/web`
Expected: PASS (4 tests)

- [ ] **Step 5: Write `apps/web/src/app/api/admin/users/[id]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";

const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum([UserRole.QC_STAFF, UserRole.MANAGER]).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  try {
    assertRole(session?.user.role, [UserRole.ADMIN]);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const parsed = updateUserSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: parsed.data,
    select: { id: true, fullName: true, username: true, role: true, isActive: true },
  });

  return NextResponse.json({ user });
}
```

- [ ] **Step 6: Write the admin UI**

```tsx
// apps/web/src/components/admin/UsersPanel.tsx
"use client";

import { useEffect, useState } from "react";

interface UserRow {
  id: string;
  fullName: string;
  username: string;
  role: "QC_STAFF" | "MANAGER" | "ADMIN";
  isActive: boolean;
}

export function UsersPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [role, setRole] = useState<"QC_STAFF" | "MANAGER">("QC_STAFF");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/users");
    const body = await res.json();
    setUsers(body.users ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ fullName, username, tempPassword, role }),
    });
    if (!res.ok) {
      setError("Không tạo được tài khoản — kiểm tra lại thông tin.");
      return;
    }
    setFullName("");
    setUsername("");
    setTempPassword("");
    await load();
  }

  async function toggleActive(user: UserRow) {
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    await load();
  }

  async function toggleManager(user: UserRow) {
    const nextRole = user.role === "MANAGER" ? "QC_STAFF" : "MANAGER";
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role: nextRole }),
    });
    await load();
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-lg font-semibold">Quản lý tài khoản</h1>

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2 rounded border bg-white p-4">
        <div>
          <label className="block text-xs font-medium">Họ tên</label>
          <input className="rounded border px-2 py-1" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium">Tên đăng nhập</label>
          <input className="rounded border px-2 py-1" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium">Mật khẩu tạm</label>
          <input className="rounded border px-2 py-1" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium">Vai trò</label>
          <select className="rounded border px-2 py-1" value={role} onChange={(e) => setRole(e.target.value as "QC_STAFF" | "MANAGER")}>
            <option value="QC_STAFF">QC Staff</option>
            <option value="MANAGER">Quản trị viên</option>
          </select>
        </div>
        <button type="submit" className="rounded bg-brand-600 px-4 py-1.5 text-white hover:bg-brand-700">
          Tạo tài khoản
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Họ tên</th>
            <th className="p-2">Tên đăng nhập</th>
            <th className="p-2">Vai trò</th>
            <th className="p-2">Trạng thái</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b">
              <td className="p-2">{u.fullName}</td>
              <td className="p-2">{u.username}</td>
              <td className="p-2">{u.role}</td>
              <td className="p-2">{u.isActive ? "Đang hoạt động" : "Đã khoá"}</td>
              <td className="space-x-2 p-2">
                {u.role !== "ADMIN" && (
                  <button onClick={() => toggleManager(u)} className="text-brand-600 hover:underline">
                    {u.role === "MANAGER" ? "Bỏ Quản trị viên" : "Cấp Quản trị viên"}
                  </button>
                )}
                <button onClick={() => toggleActive(u)} className="text-brand-600 hover:underline">
                  {u.isActive ? "Khoá" : "Mở khoá"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

```tsx
// apps/web/src/app/(dashboard)/admin/users/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { UserRole } from "@qc/db";
import { UsersPanel } from "@/components/admin/UsersPanel";

export default async function UsersPage() {
  const session = await auth();
  if (session?.user.role !== UserRole.ADMIN) redirect("/");
  return <UsersPanel />;
}
```

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, log in as `admin`, open `/admin/users`.
Expected: table shows the seeded admin; creating a QC Staff account works and appears in the list; "Cấp Quản trị viên" flips it to MANAGER.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/api/admin/users apps/web/src/app/\(dashboard\)/admin/users apps/web/src/components/admin/UsersPanel.tsx
git commit -m "feat(admin): user account management (Admin-only)"
```

---

### Task 8: Category management (Manager+ CRUD)

**Files:**
- Create: `apps/web/src/app/api/admin/categories/route.ts`
- Create: `apps/web/src/app/api/admin/categories/[id]/route.ts`
- Create: `apps/web/src/app/(dashboard)/admin/categories/page.tsx`
- Create: `apps/web/src/components/admin/CategoriesPanel.tsx`
- Test: `apps/web/src/app/api/admin/categories/route.test.ts`

**Interfaces:**
- Consumes: `assertRole` (Task 5), `prisma` (Task 2), `auth` (Task 4). Reuses the exact response-shape convention from Task 7 (`{ <resource>: ... }` / `{ <resources>: [...] }`).
- Produces: `GET/POST /api/admin/categories`, `PATCH/DELETE /api/admin/categories/[id]` — the AMIS sync worker (next plan) will read `Category` rows created here to assign `Product.categoryId`, but doesn't call these endpoints directly (it uses Prisma).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/api/admin/categories/route.test.ts
import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";
import { prisma, UserRole } from "@qc/db";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
import { GET, POST } from "./route";

function mockSession(role: UserRole | null) {
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    role ? { user: { id: "u1", username: "test", fullName: "Test", role } } : null
  );
}

describe("/api/admin/categories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET trả 403 khi là QC_STAFF", async () => {
    mockSession(UserRole.QC_STAFF);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("GET trả danh sách khi là MANAGER", async () => {
    mockSession(UserRole.MANAGER);
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("POST tạo danh mục mới khi là MANAGER", async () => {
    mockSession(UserRole.MANAGER);
    const req = new Request("http://localhost/api/admin/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Nhãn co (test)" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.category.name).toBe("Nhãn co (test)");
  });

  afterAll(async () => {
    await prisma.category.deleteMany({ where: { name: "Nhãn co (test)" } });
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/web`
Expected: FAIL — `./route` doesn't exist.

- [ ] **Step 3: Write `apps/web/src/app/api/admin/categories/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";

const MANAGER_OR_ADMIN = [UserRole.MANAGER, UserRole.ADMIN];
const createCategorySchema = z.object({ name: z.string().min(1) });

export async function GET() {
  const session = await auth();
  try {
    assertRole(session?.user.role, MANAGER_OR_ADMIN);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ categories });
}

export async function POST(req: Request) {
  const session = await auth();
  try {
    assertRole(session?.user.role, MANAGER_OR_ADMIN);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const parsed = createCategorySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const category = await prisma.category.create({ data: { name: parsed.data.name } });
  return NextResponse.json({ category }, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/web`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `apps/web/src/app/api/admin/categories/[id]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, UserRole } from "@qc/db";
import { auth } from "@/lib/auth";
import { assertRole, ForbiddenError } from "@/lib/auth/guard";

const MANAGER_OR_ADMIN = [UserRole.MANAGER, UserRole.ADMIN];
const renameCategorySchema = z.object({ name: z.string().min(1) });

async function checkAccess() {
  const session = await auth();
  assertRole(session?.user.role, MANAGER_OR_ADMIN);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await checkAccess();
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const parsed = renameCategorySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const category = await prisma.category.update({ where: { id: params.id }, data: { name: parsed.data.name } });
  return NextResponse.json({ category });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await checkAccess();
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  await prisma.category.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Write the admin UI**

```tsx
// apps/web/src/components/admin/CategoriesPanel.tsx
"use client";

import { useEffect, useState } from "react";

interface CategoryRow {
  id: string;
  name: string;
}

export function CategoriesPanel() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/categories");
    const body = await res.json();
    setCategories(body.categories ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/categories", { method: "POST", body: JSON.stringify({ name }) });
    if (!res.ok) {
      setError("Không tạo được danh mục — có thể tên đã tồn tại.");
      return;
    }
    setName("");
    await load();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-lg font-semibold">Danh mục phân loại sản phẩm</h1>

      <form onSubmit={handleCreate} className="flex items-end gap-2 rounded border bg-white p-4">
        <div>
          <label className="block text-xs font-medium">Tên danh mục</label>
          <input className="rounded border px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <button type="submit" className="rounded bg-brand-600 px-4 py-1.5 text-white hover:bg-brand-700">
          Thêm
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y rounded border bg-white">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between p-2 text-sm">
            {c.name}
            <button onClick={() => handleDelete(c.id)} className="text-red-600 hover:underline">
              Xoá
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```tsx
// apps/web/src/app/(dashboard)/admin/categories/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { UserRole } from "@qc/db";
import { CategoriesPanel } from "@/components/admin/CategoriesPanel";

export default async function CategoriesPage() {
  const session = await auth();
  if (session?.user.role !== UserRole.MANAGER && session?.user.role !== UserRole.ADMIN) redirect("/");
  return <CategoriesPanel />;
}
```

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, log in as `admin`, open `/admin/categories`.
Expected: the 4 seeded categories (Tem nhãn, Túi, Hộp, Cuộn màng PE) are listed; adding/removing a category works.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/api/admin/categories apps/web/src/app/\(dashboard\)/admin/categories apps/web/src/components/admin/CategoriesPanel.tsx
git commit -m "feat(admin): category taxonomy management (Manager+)"
```

---

### Task 9: Docker Compose finalization + README

**Files:**
- Create: `apps/web/Dockerfile`
- Create: `.dockerignore` (repo root — not `apps/web/`)
- Modify: `infra/docker-compose.yml`
- Create: `README.md`

**Interfaces:**
- No new code interfaces — this task wires what Tasks 1–8 already produced into a deployable stack.

- [ ] **Step 1: Write `.dockerignore` at the repo root**

The compose file's build `context` is `..` (repo root, set in Step 3 below) even though the Dockerfile lives at `apps/web/Dockerfile` — Docker reads `.dockerignore` from the context root, so it must be created there, not inside `apps/web/`:

```
node_modules
**/node_modules
.next
**/.next
.git
infra/.env
```

- [ ] **Step 2: Write `apps/web/Dockerfile`**

```dockerfile
FROM node:20-alpine AS base
WORKDIR /repo
COPY package.json ./
COPY packages/db/package.json packages/db/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install

FROM base AS build
COPY . .
# Root "build" script runs packages/db's own build (prisma generate + tsc,
# producing dist/index.js) before building apps/web — apps/web's build
# fails to resolve "@qc/db" without that compiled output existing first.
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

- [ ] **Step 3: Extend `infra/docker-compose.yml` with the web service**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: qc
      POSTGRES_PASSWORD: qc_dev_password
      POSTGRES_DB: qc_hoanggia
    ports:
      - "5433:5432"
    volumes:
      - qc_postgres_data:/var/lib/postgresql/data

  web:
    build:
      context: ..
      dockerfile: apps/web/Dockerfile
    restart: unless-stopped
    env_file: .env
    environment:
      # Overrides .env's DATABASE_URL: inside the Compose network the web
      # container reaches Postgres at the service name "postgres" on its
      # container port 5432 — "localhost:5433" (the host-side mapping used
      # for local `npm run dev`) refers to the web container itself here
      # and would not connect.
      DATABASE_URL: postgresql://qc:qc_dev_password@postgres:5432/qc_hoanggia
    depends_on:
      - postgres
    ports:
      - "3100:3000"

volumes:
  qc_postgres_data:
```

- [ ] **Step 4: Write `README.md`**

```markdown
# QC Hoàng Gia

Web app tra cứu Tiêu chuẩn sản phẩm / QC / Đóng gói / Giấy tờ cho bộ phận QC — độc lập với hoanggia-crm.

## Chạy local

\`\`\`bash
npm install
docker compose -f infra/docker-compose.yml up -d postgres
cp infra/.env.example infra/.env   # rồi điền DATABASE_URL, AUTH_SECRET, AMIS_APP_ID, AMIS_CLIENT_SECRET
npm run prisma:migrate -- --name init
npm run db:seed
npm run dev
\`\`\`

Đăng nhập lần đầu: `admin` / `DoiMatKhauNgay!2026` (đổi ngay sau khi đăng nhập).

## Chạy toàn bộ qua Docker

\`\`\`bash
docker compose -f infra/docker-compose.yml up -d --build
\`\`\`

## Test

\`\`\`bash
npm test
\`\`\`

## Tài liệu

- Spec: [docs/superpowers/specs/2026-09-09-qc-hoanggia-design.md](docs/superpowers/specs/2026-09-09-qc-hoanggia-design.md)
- Plan (Foundation): [docs/superpowers/plans/2026-09-09-foundation.md](docs/superpowers/plans/2026-09-09-foundation.md)
```

- [ ] **Step 5: Manual verification**

Run: `docker compose -f infra/docker-compose.yml up -d --build`
Expected: both containers start; `http://localhost:3100/login` loads the login page.

- [ ] **Step 6: Commit**

```bash
git add apps/web/Dockerfile .dockerignore infra/docker-compose.yml README.md
git commit -m "chore(infra): Dockerize web app, finalize compose stack"
```

---

## What's next (not in this plan)

Phase 2 (spec §13) — AMIS sync worker (`apps/worker`), `Product`/`ProductVersion`/`ProductCustomer`/`SyncLog` population, version-detection logic — gets its own plan once this foundation is merged and verified, since it depends on real calls to `https://crmconnect.misa.vn/api/v2/Products` that haven't been tried yet (spec §12, risk 1). Phase 3 (content tabs + TCSP export) and Phase 4 (search/listing) follow after that.
