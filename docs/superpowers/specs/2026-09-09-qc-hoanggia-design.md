# QC Hoàng Gia — Thiết kế hệ thống Web App cho bộ phận QC

**Ngày:** 2026-09-09
**Trạng thái:** Đã được anh Đào Minh Quân xác nhận qua brainstorming, chờ chuyển sang lập kế hoạch triển khai (writing-plans).

## 1. Bối cảnh & Mục tiêu

Công ty Cổ phần Giải pháp Đóng gói Hoàng Gia cần một web app riêng cho **bộ phận QC (QC Department)** để:

- Tra cứu theo mã hàng hoặc theo khách hàng để xem: Tiêu chuẩn sản phẩm (TCSP), quy trình QC, quy cách đóng gói, giấy tờ sản phẩm (COA/MSDS/ROHS...) — kèm ảnh/video hướng dẫn.
- Xem lịch sử cập nhật phiên bản của từng mã hàng, ai cập nhật.
- Cho phép người có quyền sửa/thêm nội dung, phân loại sản phẩm, upload ảnh/video, tải file TCSP đúng theo form của công ty.
- Dữ liệu mã hàng, khách hàng, đơn hàng được đồng bộ tự động từ **MISA AMIS CRM** (https://amisapp.misa.vn/crm/product/list) qua Open API chính thức, giới hạn ban đầu ở các đơn hàng năm 2026.

Đây là một **dự án hoàn toàn độc lập** với hệ thống CRM hiện có (`APP QUẢN LÝ` / hoanggia-crm): repo riêng, database riêng, tài khoản đăng nhập riêng, hạ tầng triển khai riêng (địa điểm triển khai cụ thể chưa chốt, thiết kế phải portable qua Docker).

## 2. Phạm vi

**Trong phạm vi (v1):**
- Đăng nhập, 3 cấp quyền (QC Staff / Quản trị viên / Admin).
- Đồng bộ tự động (cron + thủ công) mã hàng, khách hàng, đơn hàng năm 2026 từ AMIS Open API.
- Quản lý nội dung 4 mục (TCSP, QC, Đóng gói, Giấy tờ) theo từng phiên bản mã hàng, kế thừa dữ liệu khi có phiên bản mới từ AMIS.
- Upload/hiển thị ảnh, video, file tài liệu cho từng mục.
- Xuất file TCSP theo đúng template Excel `TCSP HOÀNG GIA.xlsx` của công ty.
- Tìm kiếm theo mã hàng / khách hàng; trang danh sách mã hàng có lọc theo loại & trạng thái.
- Lịch sử thay đổi theo phiên bản, hiển thị người cập nhật.

**Ngoài phạm vi (v1 — có thể làm sau, không thiết kế chi tiết ở đây):**
- Tạo mã hàng hoặc phiên bản mới trong app này — việc này luôn làm trên AMIS, app chỉ đồng bộ và phản ánh.
- Đồng bộ dữ liệu ngoài phạm vi năm 2026.
- Chia sẻ tài khoản đăng nhập với CRM hiện có.
- Xuất PDF cho TCSP (có thể bổ sung sau khi export Excel đã ổn định).
- Thông báo/nhắc việc tự động (email/push) khi có mã "Chờ bổ sung QC" — có thể làm ở giai đoạn sau.

## 3. Kiến trúc tổng quan

Ba thành phần chính, đóng gói Docker Compose, cùng 1 monorepo:

```
qc-hoanggia/
  apps/
    web/           # Next.js (TypeScript) — giao diện QC Staff + Quản trị viên/Admin
    sync-worker/   # Node service — cron đồng bộ AMIS + endpoint "đồng bộ ngay"
  packages/
    db/            # Prisma schema + client dùng chung giữa web và sync-worker
  infra/
    docker-compose.yml
    nginx/
```

- **apps/web**: Next.js App Router, Tailwind CSS, phiên đăng nhập bằng cookie httpOnly (bcrypt cho mật khẩu), gọi trực tiếp Prisma (không qua API riêng — giống pattern hoanggia-crm).
- **apps/sync-worker**: chạy độc lập, có lịch cron (node-cron) chạy đồng bộ hằng đêm; đồng thời expose 1 endpoint nội bộ để `apps/web` gọi khi Quản trị viên/Admin bấm "Đồng bộ ngay".
- **Database**: PostgreSQL riêng, không dùng chung với CRM.
- **Object storage**: S3-compatible (Cloudflare R2 hoặc MinIO tự host, quyết định khi chọn nơi triển khai) cho ảnh/video/file tài liệu — bucket private, truy cập qua link ký (signed URL) hết hạn ngắn.

## 4. Mô hình dữ liệu

Prisma schema (rút gọn, mô tả cấu trúc — kiểu dữ liệu chính xác sẽ hoàn thiện khi viết migration):

```prisma
enum UserRole {
  QC_STAFF
  MANAGER   // "Quản trị viên" — mọi quyền nội dung, không quản lý tài khoản
  ADMIN     // toàn quyền, gồm cả quản lý tài khoản
}

enum ProductStatus {
  ACTIVE
  PENDING_QC   // mới đồng bộ từ AMIS, chưa có nội dung QC
  DISCONTINUED
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
  id   String @id @default(cuid())
  name String @unique   // "Tem nhãn", "Túi", "Hộp", "Cuộn màng PE"...
}

model Customer {
  id             String   @id @default(cuid())
  amisCustomerId String   @unique
  name           String
}

model Product {
  id               String        @id @default(cuid())
  baseCode         String        @unique   // "SI08694"
  amisProductId    String        @unique
  categoryId       String?
  category         Category?     @relation(fields: [categoryId], references: [id])
  status           ProductStatus @default(PENDING_QC)
  currentVersionId String?       @unique
  currentVersion   ProductVersion? @relation("CurrentVersion", fields: [currentVersionId], references: [id])
  versions         ProductVersion[] @relation("AllVersions")
  customers        ProductCustomer[]
  createdAt        DateTime      @default(now())
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
  id             String   @id @default(cuid())
  productId      String
  product        Product  @relation("AllVersions", fields: [productId], references: [id])
  productAsCurrent Product? @relation("CurrentVersion")
  versionNumber  Int              // 1, 2, 3 -> hiển thị "<baseCode>.<versionNumber>"
  amisProductId  String   @unique // mã AMIS thực tế của phiên bản này (vd mã cho "SI08694.2")
  name           String
  description    String?
  isCurrent      Boolean  @default(true)
  createdByAmisSync Boolean @default(true)
  createdAt      DateTime @default(now())

  tcsp           TCSPData?
  qc             QCData?
  packaging      PackagingData?
  documents      DocumentsData?
  changeLogs     ChangeLogEntry[]
}

model TCSPData {
  id              String   @id @default(cuid())
  versionId       String   @unique
  version         ProductVersion @relation(fields: [versionId], references: [id])
  materialCode    String?  // "Mã NL"
  description     String?
  preparedBy      String?
  approvedBy      String?
  approvedAt      DateTime?
  specRows        TCSPSpecRow[]
  media           MediaAsset[] @relation("TCSPMedia")
}

model TCSPSpecRow {
  id         String   @id @default(cuid())
  tcspId     String
  tcsp       TCSPData @relation(fields: [tcspId], references: [id])
  groupName  String   // "Kích thước" | "TC khác"
  criterion  String   // "Chiều dài", "Chất liệu"...
  value      String
  tolerance  String?
  unit       String?
  note       String?
  sortOrder  Int      @default(0)
}

model QCData {
  id            String   @id @default(cuid())
  versionId     String   @unique
  version       ProductVersion @relation(fields: [versionId], references: [id])
  checklist     String?  // các mục cần QC (rich text / danh sách)
  knownDefects  String?  // các lỗi đã từng mắc phải
  specialNotes  String?  // lưu ý đặc biệt
  media         MediaAsset[] @relation("QCMedia")
}

model PackagingData {
  id            String   @id @default(cuid())
  versionId     String   @unique
  version       ProductVersion @relation(fields: [versionId], references: [id])
  instructions  String?  // hướng dẫn đóng gói
  specialNotes  String?  // lưu ý đóng gói, tem nhãn dán thùng
  media         MediaAsset[] @relation("PackagingMedia")
}

enum DocumentKind {
  COA
  MSDS
  ROHS
  OTHER
}

model DocumentsData {
  id         String   @id @default(cuid())
  versionId  String   @unique
  version    ProductVersion @relation(fields: [versionId], references: [id])
  files      ProductDocument[]
}

model ProductDocument {
  id            String       @id @default(cuid())
  documentsId   String
  documents     DocumentsData @relation(fields: [documentsId], references: [id])
  kind          DocumentKind
  label         String
  storageKey    String
  uploadedAt    DateTime @default(now())
}

model MediaAsset {
  id          String   @id @default(cuid())
  storageKey  String
  mimeType    String
  caption     String?
  sortOrder   Int      @default(0)
  tcspId      String?
  qcId        String?
  packagingId String?
}

model ChangeLogEntry {
  id           String   @id @default(cuid())
  versionId    String
  version      ProductVersion @relation(fields: [versionId], references: [id])
  fieldPath    String   // vd "tcsp.specRows[Chiều dài]"
  oldValue     String?
  newValue     String?
  changedBy    String?  // userId, null nếu do sync AMIS tự tạo
  changedAt    DateTime @default(now())
  source       String   // "AMIS_SYNC" | "MANUAL"
}

model SyncLog {
  id             String   @id @default(cuid())
  startedAt      DateTime @default(now())
  finishedAt     DateTime?
  newProducts    Int      @default(0)
  updatedLinks   Int      @default(0)
  newVersions    Int      @default(0)
  flaggedReview  Int      @default(0)
  errorMessage   String?
}
```

## 5. Đăng nhập & phân quyền

- Xác thực bằng username + mật khẩu (bcrypt hash), phiên đăng nhập cookie httpOnly, giới hạn số lần đăng nhập sai (khoá tạm 15 phút sau 5 lần sai) để chống dò mật khẩu.
- 3 vai trò (`UserRole`):
  - **QC_STAFF**: chỉ đọc — tìm kiếm, danh sách mã hàng, chi tiết mã hàng (5 tab), tải file.
  - **MANAGER** ("Quản trị viên", do Admin cấp cho 1 QC Staff): thêm quyền sửa nội dung 4 mục, upload media/tài liệu, quản lý danh mục phân loại, bấm "Đồng bộ ngay", xem log đồng bộ. Không thấy mục quản lý tài khoản.
  - **ADMIN**: mọi quyền của MANAGER + quản lý tài khoản người dùng (tạo/sửa/khoá tài khoản, cấp/thu hồi vai trò MANAGER).
- Không có mục "Tạo mã hàng" / "Tạo phiên bản" ở bất kỳ vai trò nào — những mã/phiên bản này luôn đến từ đồng bộ AMIS.
- Tài khoản do Admin tạo thủ công trong Khu quản trị (không có đăng ký công khai); người dùng đổi mật khẩu ở lần đăng nhập đầu.

## 6. Đồng bộ dữ liệu từ AMIS

**Xác thực:** `sync-worker` giữ `AMIS_APP_ID`/`AMIS_CLIENT_SECRET` (biến môi trường, không lộ ra frontend — công ty đã có sẵn cặp này, đang dùng thật cho đồng bộ đơn hàng bên hoanggia-crm). Gọi `POST https://crmconnect.misa.vn/api/v2/Account` với `{client_id, client_secret}` để lấy Bearer token, gắn kèm header `Clientid` ở các request sau. Token không nêu rõ thời hạn trong tài liệu tổng quan — worker tự gọi lại lấy token mới khi gặp lỗi xác thực (401), theo đúng pattern đã chạy ổn định trong `hoanggia-crm/apps/worker/src/sync/amis.ts`.

**Kích hoạt:** cron hằng đêm (mặc định 02:00) + endpoint nội bộ gọi bởi nút "Đồng bộ ngay" (chỉ MANAGER/ADMIN thấy nút này).

**Xác nhận thực tế bằng cách gọi thử API thật (2026-09-09), thay cho suy đoán:**
- `GET /api/v2/Products` trả về `id` (số, dùng làm `amisProductId`), `product_code` (vd `"SI08701"`), `product_name`, `description`, `inactive`, `product_category` (vd `"Sản xuất IN"` — đây là phân loại nội bộ AMIS theo dây chuyền sản xuất, **khác hoàn toàn** với `Category` của app QC — không dùng field này để gán `Product.categoryId`, Admin/Quản trị viên tự gán tay theo đúng thiết kế mục 3).
- `GET /api/v2/SaleOrders` trả về `sale_order_product_mappings[]` (mỗi dòng có `product_code`, `description`, `custom_field3`), `account_name`, `sale_order_date`, `organization_unit_name` (xác nhận nhiều phòng ban cùng ghi vào 1 hệ thống, đúng như rủi ro mục 12 đã lường trước).
- `GET /api/v2/Customers` trả về `id` (dùng làm `amisCustomerId`) và `account_name`.

**Quy ước đặt mã phiên bản — phát hiện quan trọng cần sửa lại cách nhận diện:** quét thử 1000 mã hàng thật cho thấy AMIS dùng dấu chấm (`.`) trong mã hàng cho **hai mục đích khác nhau, không phân biệt được nếu chỉ nhìn "có dấu chấm"**:
- Phiên bản thật (đúng mô tả của anh Quân): `SI08694.1`, `SI07284.1`, `SI00653.3`, `AA09511.1` — dạng `<2-4 chữ cái><4-7 số>.<1-2 số>`.
- Một kiểu đánh số nội bộ khác của AMIS, **không phải phiên bản**: `AA03.000170`, `AA01.00243`, `AA08.00012` — dạng `<2-4 chữ cái><1-3 số>.<số có số 0 ở đầu, thường 5-6 chữ số>`. Nếu dùng "có dấu chấm" làm điều kiện nhận diện phiên bản, các mã này sẽ bị hiểu nhầm.

→ Quy tắc nhận diện chính xác (đã kiểm chứng khớp 100% với mẫu thật): regex `^([A-Z]{1,4}\d{4,7})\.(\d{1,2})$` — phần trước dấu chấm phải có **4-7 chữ số** (không phải 1-3 như kiểu đánh số kia), phần sau dấu chấm chỉ **1-2 chữ số** (số phiên bản thật không bao giờ có số 0 ở đầu hay dài). Vẫn giữ điều kiện thứ hai làm lưới an toàn kép: chỉ coi là phiên bản mới khi *vừa* khớp regex *vừa* có `baseCode` (phần trước dấu chấm) đã tồn tại sẵn trong hệ thống — hai điều kiện cộng lại loại gần hết rủi ro nhận nhầm.

**Các bước mỗi lần chạy:**
1. Gọi SaleOrders API, lọc đơn hàng có ngày đặt trong năm 2026 (phân trang cho tới hết).
2. Từ mỗi đơn hàng, rút ra: mã hàng (`sale_order_product_mappings[].product_code`), khách hàng (`account_name`/customer id của đơn), ngày đặt (`sale_order_date`).
3. ~~Với mỗi mã hàng xuất hiện, gọi Products API lấy `id` (→ `amisProductId`), `product_name`, `description` mới nhất.~~ **Cập nhật theo implementation thực tế đã triển khai (2026-09-10):** worker KHÔNG gọi thêm API `Products` cho từng mã hàng — mọi thứ cần dùng đã có sẵn ngay trong response của `SaleOrders` đang gọi ở bước 1: `sale_order_product_mappings[].product_code` (mã hàng) và `.description` (tên/mô tả dùng làm `ProductVersion.name`/`description`, fallback về chính `product_code` nếu rỗng). `amisProductId` dùng khoá tổng hợp `"code:" + product_code` (không phải `id` số thật của AMIS) — đây là quyết định kỹ thuật thực dụng, không phải sai sót: khoá này chỉ cần duy nhất trong app QC để chống trùng khi upsert, không cần khớp với `id` gốc bên AMIS. Hệ quả (đã ghi rõ ở mục 12): không có cách xác nhận tuyệt đối 1 `product_code` luôn ứng với đúng 1 sản phẩm AMIS duy nhất (rủi ro mã bị dùng lại — xem phát hiện mục 12).
4. **Nhận diện phiên bản:** áp quy tắc regex + điều kiện `baseCode` đã tồn tại nêu trên (dựa trên `product_code` lấy trực tiếp từ `SaleOrders`, không phải từ `Products`). Không khớp (bao gồm cả mã trần chưa từng thấy `baseCode` nào khớp) → coi là mã hàng hoàn toàn mới.
5. **Upsert** (không bao giờ tự động ghi đè nội dung QC do người dùng nhập):
   - Mã hoàn toàn mới → tạo `Product` (`status = PENDING_QC`) + `ProductVersion` số 1 rỗng nội dung.
   - Phiên bản mới nhận diện được → tạo `ProductVersion` với `versionNumber` = đúng số hậu tố `.N` thật do AMIS gán (không phải bộ đếm nội bộ tăng dần theo thứ tự sync gặp mã — **đã sửa 2026-09-10**, xem mục 12), luôn kế thừa toàn bộ dữ liệu 4 mục từ phiên bản `isCurrent` hiện tại. Chỉ khi `versionNumber` mới LỚN HƠN `versionNumber` của phiên bản `isCurrent` hiện tại thì mới set phiên bản cũ `isCurrent = false`, repoint `Product.currentVersionId` sang phiên bản mới, và ghi `ChangeLogEntry` nguồn `AMIS_SYNC` mô tả "phiên bản mới, chờ cập nhật nội dung"; nếu nhỏ hơn hoặc bằng (mã AMIS cũ hơn/trùng số vừa được phát hiện), vẫn tạo `ProductVersion` (để xem trong Lịch sử phiên bản) nhưng KHÔNG đổi `isCurrent`/`currentVersionId`. Toàn bộ chuỗi ghi này chạy trong 1 `prisma.$transaction` để tránh trạng thái dở dang khi worker crash giữa chừng.
     - **Trường hợp `versionNumber` phân tích được TRÙNG với 1 phiên bản đã có sẵn cho cùng `baseCode`** (2 chuỗi mã AMIS khác nhau về mặt chữ nhưng parse ra cùng 1 số, vd hậu tố `.1` và `.01`, hoặc chuỗi mã bị AMIS/nghiệp vụ dùng lại — xem mục 12): KHÔNG tạo `ProductVersion` mới (tránh đụng constraint và tránh tạo 2 dòng lịch sử cho cùng 1 "phiên bản"), nhưng **đã sửa 2026-09-14** — trước đây bỏ qua hoàn toàn không dấu vết; giờ ghi 1 dòng log cảnh báo (`logger.warn`, có `amisProductId`/mã gốc/`versionNumber` trùng) và tăng `SyncLog.duplicateVersionCodes`, hiển thị ở trang Đồng bộ AMIS để MANAGER/ADMIN rà soát thủ công.
   - Mã đã tồn tại, không có phiên bản mới → chỉ cập nhật/khởi tạo `ProductCustomer` (liên kết khách hàng + ngày đặt gần nhất).
   - Nếu tên/mô tả cơ bản từ AMIS khác dữ liệu đang lưu ở phiên bản hiện hành mà không phát sinh mã phiên bản mới → không tự sửa, chỉ gắn cờ để MANAGER/ADMIN xem xét (`SyncLog.flaggedReview`, **đã hiển thị ở trang Đồng bộ AMIS từ 2026-09-14** — trước đó có ghi số nhưng chưa hiện ra giao diện).
6. Ghi 1 bản ghi `SyncLog` (số liệu tổng hợp gồm `newProducts`/`newVersions`/`updatedLinks`/`flaggedReview`/`duplicateVersionCodes` + lỗi nếu có). Lỗi kết nối AMIS không làm crash worker; job dừng an toàn, log lỗi để xem trong khu quản trị.

**Phụ thuộc bên ngoài:** đã có sẵn `AMIS_APP_ID`/`AMIS_CLIENT_SECRET` (cùng cặp credential đang dùng cho đồng bộ đơn hàng ở hoanggia-crm), đã xác thực gọi API thật thành công. Lưu tại `infra/.env` (không commit git).

## 7. Quản lý nội dung 4 mục & Media

**Chia làm 2 plan triển khai (chốt 2026-09-10):** Plan 3a "Nội dung & Lịch sử" (trang chi tiết 5 tab, form sửa văn bản, tab Lịch sử) — **đã merge vào master 2026-09-11**; Plan 3b "Media & xuất file" (upload ảnh/video/tài liệu, xuất Excel TCSP) — thiết kế chi tiết chốt 2026-09-11, xây trên nền 3a.

**Route (Plan 3a):** `/products/[baseCode]` — trang chi tiết mã hàng, mặc định hiển thị `currentVersion`. Xem phiên bản cũ qua `/products/[baseCode]/v/[versionNumber]` (chỉ đọc, không có nút Chỉnh sửa).

- Trang chi tiết mã hàng có 5 tab: **Tiêu chuẩn sản phẩm, QC sản phẩm, Quy cách đóng gói, Giấy tờ sản phẩm, Lịch sử phiên bản**.
- **Chế độ xem/sửa:** mỗi tab (trừ Lịch sử) mặc định ở chế độ xem; MANAGER/ADMIN thấy nút "Chỉnh sửa" để chuyển sang form sửa (tránh sửa nhầm), có nút Lưu/Huỷ. QC_STAFF chỉ có chế độ xem. Mỗi lần Lưu ghi thêm `ChangeLogEntry` nguồn `MANUAL` (field, giá trị cũ/mới, người sửa) — hiển thị ở tab Lịch sử phiên bản cùng danh sách `ProductVersion` (số hiệu, ngày tạo, nguồn AMIS_SYNC/MANUAL).
- Tab TCSP: form gồm mô tả, mã NL, người lập/duyệt + bảng `TCSPSpecRow` (nhóm Kích thước/TC khác) cho thêm/xoá dòng động.
- Tab QC / Đóng gói (Plan 3a): form văn bản đơn giản (textarea nhiều dòng cho checklist/lỗi từng gặp/lưu ý) — chưa cần rich text editor.
- Tab Giấy tờ sản phẩm (Plan 3a): hiển thị khung danh sách file (rỗng, vì upload chưa có ở 3a) — UI sẵn sàng nhận dữ liệu khi Plan 3b thêm upload.
- **Lưu ý an toàn khi sửa nội dung (liên quan phát hiện mục 12 về mã AMIS bị dùng lại/rơi phiên bản):** form sửa PHẢI hiển thị rõ `versionNumber`/mã AMIS gốc (`.N`) của phiên bản đang xem ngay trên đầu trang, để Quản trị viên nhận ra nếu nội dung "kế thừa" từ 1 phiên bản trước có vẻ không khớp (vd tên sản phẩm đổi khác hẳn) — đây là hàng rào tối thiểu cho tới khi có cảnh báo tự động (chưa làm ở Plan 3a/3b).

**Media (Plan 3b — chốt thiết kế 2026-09-11, sau khi Plan 3a merge):**

- Mỗi tab TCSP/QC/Đóng gói có khu upload nhiều ảnh/video (`MediaAsset`), có chú thích + sắp xếp thứ tự; tab Giấy tờ sản phẩm (trước đó ở Plan 3a chỉ đọc) nay có thêm nút "Chỉnh sửa" giống các tab khác để upload/xóa file tài liệu phân loại COA/MSDS/ROHS/Khác (`ProductDocument`). Quyền tạo/sửa/xóa media/tài liệu: MANAGER/ADMIN, giống quyền sửa nội dung văn bản.
- **Lưu trữ: MinIO tự host trong Docker** (chốt 2026-09-10). Thêm service `minio` vào `docker-compose.yml`, tạo bucket riêng lúc khởi động; `apps/web` và `apps/worker` đều cần kết nối (worker cần để sao chép file khi kế thừa phiên bản, xem dưới).
- **Luồng upload (client upload thẳng lên MinIO, tránh qua server app):**
  1. Client gọi `POST /api/products/[baseCode]/media/upload-url` khai báo `{tab, fileName, mimeType, size}`.
  2. Server kiểm tra quyền + giới hạn dung lượng (ảnh ~10MB, video ~200MB mp4), sinh `storageKey` dạng `products/<baseCode>/<versionId>/<cuid>-<tênfile>`, trả về presigned PUT URL có **ký cứng Content-Length/Content-Type** (client khai nhỏ mà tải file to sẽ bị MinIO từ chối do sai chữ ký, không cần cấu hình policy riêng).
  3. Client `PUT` thẳng file lên MinIO bằng URL đó.
  4. Client gọi `POST /api/products/[baseCode]/media` (hoặc `/documents`) để tạo `MediaAsset`/`ProductDocument` (chú thích, thứ tự, loại tài liệu) + ghi `ChangeLogEntry` nguồn `MANUAL`.
- **Xem/tải file:** khi server render trang chi tiết (đã đăng nhập), với mỗi media/tài liệu sinh 1 link GET đã ký, hết hạn sau 5 phút, nhúng thẳng vào trang — không có link công khai vĩnh viễn.
- **Xóa:** xóa dòng DB + xóa hẳn object trên MinIO ngay (media không phải dữ liệu audit bắt buộc giữ vĩnh viễn như nội dung văn bản TCSP/QC/Đóng gói).
- **Kế thừa media khi sinh phiên bản mới (sync-worker):** ảnh/video/tài liệu của phiên bản trước tự động mang sang phiên bản mới (nhất quán với cách nội dung văn bản đã kế thừa ở Plan 3a). Vì quyết định "xóa hẳn file" ở trên, **mỗi phiên bản phải có file độc lập của riêng mình** — nếu chỉ trỏ chung `storageKey`, xóa media ở phiên bản mới sẽ làm mất luôn ảnh của phiên bản cũ (vốn phải giữ nguyên, chỉ đọc). Do đó khi `cloneVersionContent()` (worker) sao chép `MediaAsset`/`ProductDocument` sang phiên bản mới, phải gọi `CopyObject` trên MinIO (server-to-server, tức thời) để tạo `storageKey` mới độc lập trước khi tạo dòng DB — **đây là thay đổi bắt buộc so với code `cloneVersionContent()` hiện tại** (đã viết từ trước, hiện chỉ copy dòng DB và dùng chung `storageKey` cũ, chưa lộ vấn đề vì chưa có media thật). Lỗi `CopyObject` của 1 file không được làm hỏng cả lần đồng bộ — bỏ qua đúng file đó, ghi log cảnh báo, tiếp tục.
- **Trang phiên bản cũ (`/products/[baseCode]/v/[versionNumber]`):** mở rộng để hiển thị đầy đủ như phiên bản hiện hành (toàn bộ trường TCSP gồm bảng `TCSPSpecRow`, mã NL, người lập/duyệt/ngày duyệt; QC và Đóng gói đầy đủ trường bao gồm lưu ý/lỗi thường gặp; media/tài liệu — chỉ xem, không có nút sửa/xóa/upload) thay vì bản rút gọn 3 trường như Plan 3a đã làm (việc còn treo từ Plan 3a, gộp sửa luôn ở đây vì Plan 3b đụng vào cùng trang này để thêm nút Tải TCSP + hiển thị media).

## 8. Xuất file TCSP theo form Hoàng Gia

- **File mẫu** (`assets/templates/tcsp-template.xlsx` trong repo, chuẩn hoá lại 2026-09-11 từ `TCSP HOÀNG GIA.xlsx` gốc): file gốc có 4 sheet (1 sheet "Specification" ẩn không dùng; 3 sheet "TCSP Hàng Mã AA & ST"/"SB"/"SI" — kiểm tra thực tế cho thấy **cấu trúc giống hệt nhau**, chỉ khác dữ liệu ví dụ theo tiền tố mã). Chỉ giữ lại **1 sheet layout dùng chung cho mọi mã hàng**, xóa dữ liệu ví dụ thật của khách hàng (SI06526/SB0954/AA04063) trước khi đưa vào code.
- **Cấu trúc mẫu:** ô "Mã"/"Tên" cố định; ô "Mô tả"/"Mã NL" (vùng merge); vùng "Ảnh/Market" để chèn ảnh sản phẩm (file gốc vốn đã nhúng ảnh thật kiểu này — dùng API chèn ảnh của thư viện Excel, ví dụ `exceljs` `addImage`, vào đúng vùng neo); bảng thông số (cột Tiêu chuẩn/Tiêu chí/Thông số/D.sai/Đơn vị/Ghi chú, nhóm theo `groupName` với ô nhãn nhóm merge dọc); dòng chân trang Người lập/Người duyệt/Ngày duyệt.
- **Số dòng thông số là ĐỘNG** (không cố định — thực tế có thể nhiều/ít hơn ví dụ trong file gốc): khi xuất, server phải chèn/xóa dòng trong bản sao của sheet cho khớp số dòng thật của từng nhóm `TCSPSpecRow`, tính lại vùng merge nhãn nhóm (cột A) theo đúng số dòng mới, và dịch dòng chân trang xuống/lên theo đúng vị trí sau khi bảng co giãn.
- Khi bấm "Tải TCSP" (ở tab Tiêu chuẩn sản phẩm, và ở trang phiên bản cũ để tải TCSP của đúng phiên bản đó): server mở template, điền toàn bộ dữ liệu của `versionId` được yêu cầu (mặc định `currentVersion` nếu không truyền phiên bản), xuất file `.xlsx` để tải về. **Quyền tải: cả 3 vai trò** (QC_STAFF/MANAGER/ADMIN) — đây là hành động đọc/xuất dữ liệu, không phải sửa nội dung, nên không giới hạn như quyền sửa.
- Xuất PDF: ngoài phạm vi v1 (mục 2), để ngỏ cho giai đoạn sau.

## 9. Tìm kiếm & Danh sách mã hàng

**(Chốt thiết kế chi tiết 2026-09-12)**

- **Trang tìm kiếm (trang chủ, `/`):** 1 ô tìm kiếm (form GET, `?q=`), server component đọc `searchParams`, cả 3 vai trò dùng được.
  - **Khớp mã có hậu tố phiên bản** (`<baseCode>.<n>`, dùng lại mẫu regex đã kiểm chứng ở `apps/worker/src/sync/version-detection.ts` — nhân bản 1 hàm nhỏ tương tự sang `apps/web`, không đáng tách package riêng cho 1 hàm thuần) **và khớp đúng 1 kết quả duy nhất** → chuyển hướng thẳng: nếu là phiên bản hiện hành → `/products/[baseCode]`; nếu là phiên bản cũ → `/products/[baseCode]/v/[n]` (chỉ đọc).
  - Ngược lại (mã gốc không hậu tố, khớp gần đúng, hoặc theo tên khách hàng): so khớp gần đúng không phân biệt hoa/thường bằng Postgres `ILIKE` trên `Product.baseCode` **hoặc** tên khách hàng (join `ProductCustomer` → `Customer`) — đủ dùng ở quy mô vài nghìn mã hàng, không cần công cụ tìm kiếm ngoài. Tìm theo khách hàng trả về toàn bộ mã hàng của khách đó.
  - **Kết quả hiển thị ngay trên trang chủ**, danh sách dưới ô tìm kiếm (Mã hàng, Tên hàng hoá, Khách hàng nếu tìm theo khách) — không chuyển trang.
- **Trang Danh sách mã hàng (`/danh-sach`, route riêng — dùng đúng đường dẫn này để khớp link điều hướng đã có sẵn từ Foundation trong `DashboardNav.tsx`, không phải `/products`):** bảng Mã hàng / Tên hàng hoá / Loại sản phẩm / Trạng thái, lọc theo Loại sản phẩm và Trạng thái qua `searchParams` (đặc biệt lọc nhanh các mã `PENDING_QC` cần bổ sung), phân trang 20 dòng/trang. Cả 3 vai trò xem được.
- Click vào 1 dòng kết quả (ở cả 2 trang) → mở trang chi tiết mã hàng (5 tab).
- Thêm link "Danh sách mã hàng" vào điều hướng (`DashboardNav.tsx`, đã có sẵn từ Foundation).

## 10. Hạ tầng, triển khai, vận hành

- Docker Compose: `web`, `sync-worker`, `postgres`, `nginx`, `minio` (chốt 2026-09-10 — tự host object storage, không dùng Cloudflare R2/dịch vụ ngoài).
- Biến môi trường nhạy cảm (AMIS client_id/secret, DB URL, khoá storage, session secret) qua `.env`, không commit.
- Thiết kế portable: không phụ thuộc vị trí máy chủ cụ thể — có thể chạy trên VPS Hostinger hiện tại (stack Docker tách biệt CRM) hoặc VPS mới, tuỳ quyết định sau của anh Quân.

## 11. Kiểm thử

- Unit test cho logic upsert đồng bộ AMIS (nhận diện mã mới / phiên bản mới / chỉ cập nhật liên kết khách hàng), đặc biệt test mẫu nhận diện `<baseCode>.<n>`.
- Unit test cho việc điền dữ liệu vào template Excel TCSP (đúng ô, đúng số dòng khi số lượng `TCSPSpecRow` thay đổi).
- Test phân quyền: đảm bảo QC_STAFF không gọi được API sửa nội dung/upload/quản lý tài khoản.
- Test tích hợp: đăng nhập → tìm kiếm → mở chi tiết → xem đúng 5 tab → tải TCSP ra file hợp lệ.

## 12. Rủi ro & phụ thuộc bên ngoài

- ~~Định dạng dữ liệu Products thực tế từ AMIS chưa kiểm chứng~~ **Đã giải quyết (2026-09-09):** gọi thử API thật, xác nhận đầy đủ field cần dùng cho Products/SaleOrders/Customers (xem mục 6).
- ~~Quy ước đặt mã phiên bản `<baseCode>.<n>` chưa xác nhận~~ **Đã giải quyết một phần, phát hiện thêm rủi ro mới đã có cách xử lý (2026-09-09):** AMIS dùng dấu chấm cho 2 mục đích khác nhau; đã tìm ra quy tắc regex + điều kiện kép phân biệt chính xác 100% trên mẫu thật 1000 mã hàng (xem mục 6). Rủi ro còn lại: quy tắc này dựa trên 1000 mã quét được tại 1 thời điểm — nếu về sau AMIS xuất hiện kiểu mã mới không khớp cả 2 mẫu đã biết, sync sẽ coi nó là "mã hoàn toàn mới" (an toàn — không tự động ghi đè nhầm nội dung QC của mã khác, chỉ có thể bỏ sót việc nối phiên bản) thay vì gây lỗi.
- **Phạm vi dữ liệu:** khác với hoanggia-crm (chỉ đồng bộ đơn của nhân viên PKD1 đang quản lý), app QC cần **toàn bộ mã hàng của cả công ty** (mọi phòng kinh doanh, mọi khách hàng) trong năm 2026 — không lọc theo nhân viên/phòng ban. Cần chú ý khi viết lại logic đồng bộ, không copy nguyên bộ lọc `managedCodes` từ hoanggia-crm. Đã xác nhận qua dữ liệu thật: trường `organization_unit_name` trên SaleOrders cho thấy nhiều phòng ban khác nhau cùng ghi vào hệ thống AMIS (vd "Phòng kinh doanh I"), đúng như lường trước.
- **Foundation phase để lại việc chưa làm cần ưu tiên sớm ở phase này hoặc trước khi dùng thật:** chưa có tính năng đổi mật khẩu (`PATCH /api/me/password`) — tài khoản admin mặc định hiện không đổi được mật khẩu qua giao diện.
- ~~Đồng bộ AMIS thật chưa kiểm chứng end-to-end với dữ liệu sản xuất~~ **Đã kiểm chứng bằng dữ liệu thật, nhiều lần, xuyên suốt Task 1-8 (2026-09-10):** trong quá trình cài đặt (Task 1-7) đã chạy sync thật nhiều lần với `AMIS_APP_ID`/`AMIS_CLIENT_SECRET` thật, phát hiện và sửa 3 lỗi ngoài phạm vi ban đầu nhờ dữ liệu thật (lỗi baseCode trùng khi mã trần trùng gốc mã có version — `fadd90b`; lỗi crash khi mã version lặp lại — `07d9bf2`; lỗi bỏ sót liên kết khách hàng do lấy nhầm `productId` — `0ee20d2`; lỗi `lastOrderDate` bị đơn cũ ghi đè khi xử lý sau — Task 4 round 2), đạt trạng thái đồng bộ sạch với số liệu thật, và đã xác nhận toàn bộ stack Docker (`web`+`worker`+`postgres`) chạy thật, gọi sync qua mạng nội bộ Compose thành công (Task 7, xem `docker exec ... wget` kết quả `{"newProducts":2,"newVersions":0,"updatedLinks":11818,...}`).

  **Task 8 — kiểm tra trực tiếp dữ liệu đã đồng bộ (2026-09-10), không chạy sync mới vì DB hiện có đã đủ đại diện:**
  - Trạng thái DB tại thời điểm kiểm tra: 4563 `Product`, 4757 `ProductVersion`, 438 `Customer`, 4714 `ProductCustomer`, 3 `SyncLog` (2 thành công — lần đầu 4561 mã mới/194 phiên bản mới/11812 lượt cập nhật liên kết, lần sau 2 mã mới/0 phiên bản mới/11818 lượt cập nhật liên kết; 1 lần lỗi thoáng qua "Không lấy được token AMIS" tự phục hồi ở lần chạy kế tiếp — không phải lỗi treo).
  - `baseCode` thật hợp lý: các tiền tố SI/AA/SB/ST/GC/GCN chiếm đa số (2415/1632/242/206/45/19), khớp mẫu đã thấy ở lần probe API mục 6; `AA04334` (mã đã thấy khi probe API) có mặt trong dữ liệu đồng bộ. Cũng thấy vài mã dịch vụ ngắn hợp lệ không phải hàng hoá vật lý (`DG` = "Diễn giải", `DVVC` = "Dịch vụ vận chuyển cho khách hàng") — đúng bản chất dòng trong đơn hàng AMIS, không phải dữ liệu rác.
  - Xác nhận **không** có `baseCode` nào bị tách nhầm từ kiểu mã "AA03.000170" (2-3 chữ số trước dấu chấm) thành 1 mã gốc giả — quét toàn bộ `Product` không tìm thấy trường hợp nào có `baseCode` trùng đúng phần trước dấu chấm của 1 `baseCode` khác đang lưu dạng "X.YYYYYY". Ví dụ thật kiểm chứng quy tắc regex hoạt động đúng: mã `AA04.000108` được lưu nguyên vẹn thành 1 `Product.baseCode` duy nhất (không bị tách), vì phần trước dấu chấm ("04") chỉ có 2 chữ số, không đạt ngưỡng 4-7 chữ số của quy tắc phiên bản thật.
  - Có 138 `baseCode` khác nhau sở hữu ít nhất 1 `ProductVersion.versionNumber > 1` (chuỗi phiên bản thật). `TCSPData`/`QCData` toàn hệ thống đang có 0 dòng — xác nhận đúng như kỳ vọng: chưa Admin nào nhập nội dung nên không có gì để kế thừa, và việc tạo phiên bản mới cho các mã này không hề lỗi dù nội dung kế thừa trống.
  - `ProductCustomer` lấy mẫu ngẫu nhiên 15 dòng: toàn bộ tên khách hàng (vd "CÔNG TY TNHH MARUKOH PAPER VIỆT NAM", "CÔNG TY TNHH YAMAHA MOTOR VIỆT NAM") và `baseCode` liên kết đều hợp lý, `lastOrderDate` nằm trong năm 2026.
  - **Giải quyết cờ "Cannot verify" của Task 4** (rủi ro mã `product_code` bị dùng lại cho sản phẩm khác nhau, làm khoá tổng hợp `code:<product_code>` không an toàn): không thể truy vấn lại field `id` gốc từ chính API `Products` của AMIS trong phạm vi task này (endpoint đó chỉ được khám phá, chưa tích hợp lưu vết), nên đây là kiểm tra gián tiếp tốt nhất có thể trên dữ liệu đã đồng bộ — **không phải bằng chứng tuyệt đối**. Cách làm: so sánh `ProductVersion.name` giữa các phiên bản của cùng 1 `baseCode` (138 chuỗi nói trên) xem có "trôi" sang sản phẩm khác hẳn không (tên đổi nhẹ theo lô/ngày là bình thường, đổi hẳn sang mặt hàng khác là dấu hiệu mã bị dùng lại).
    - **≥135/138 chuỗi phiên bản nhất quán** — chỉ đổi số lô/ngày/số phiên bản trong tên (đa số chỉ là đổi cách gọi "Nhãn"→"Tem" hoặc tương tự, không phải đổi sản phẩm), cùng 1 sản phẩm xuyên suốt (vd chuỗi `AA0111735`/`SI04914`: đều là "Nhãn (trung gian) ống nghiệm lấy máu Clot Activator 2ml", chỉ đổi mã lô).
    - **Ít nhất 5/138 chuỗi cho thấy bằng chứng thật về việc mã gốc bị dùng lại cho sản phẩm khác nhau** — con số này là **ngưỡng sàn (floor), không phải số đếm chính xác**: chỉ so sánh tên phiên bản ĐẦU và tên phiên bản CUỐI của mỗi chuỗi (không so từng cặp liền kề), nên có thể còn bỏ sót các trường hợp trôi giữa chừng rồi quay lại tên gần giống ban đầu. Xác nhận rủi ro Task 4 nêu là có thật (dù hiếm) — 3 trường hợp nêu ban đầu, cộng thêm 2 trường hợp mới phát hiện khi quét rộng lại toàn bộ 138 chuỗi:
      - `SI08201`: 7 phiên bản, mỗi phiên bản là tem niêm phong thùng hàng cho 1 khách hàng khác nhau (`DA ALL VINA`, `H&S TECH VINA`, `DREAM TECH`, `KHVATEC HANOI`, `MÀU CAM`, `SEV SERCURITY Tím`, `SEV SERCURITY Đỏ`) — rõ ràng là các đơn in tem riêng biệt cho từng khách, bị AMIS/nghiệp vụ dùng chung 1 mã gốc.
      - `SI06877` và `SI06878`: các phiên bản đầu là nhãn "SH.C3/SH.C5 phủ bóng", nhưng xen giữa có phiên bản là nhãn "Bình khí CO2 3kg/5kg" — 2 loại hàng hoá vật lý khác hẳn nhau dùng chung 1 mã gốc.
      - `SI00035` (mới phát hiện): "Nhãn lọ Avinora bọt tắm gội cho bé" → "Tem giấy cán bóng Nước muối Sao Mai 500ml" — nhãn tắm gội cho bé chuyển thành tem nước muối, 2 khách hàng khác nhau hoàn toàn.
      - `AA03979` (mới phát hiện): "Tờ hướng dẫn sử dụng sản phẩm SA310P" → "Tờ HDSD QTT400X-PN" — tờ hướng dẫn sử dụng của 2 model sản phẩm khác nhau.
    - **Đã xác định lại chính xác cơ chế gây ra (2026-09-10), và bác bỏ hướng khắc phục đã đề xuất trước đó:** với riêng `SI08201`, AMIS đang dùng hậu tố `.N` như **1 mã phân biệt lô in theo từng khách hàng** (mỗi khách 1 phiên bản = 1 mẫu tem in giống hệt nhau về khuôn dạng, chỉ khác nội dung in cho khách đó), KHÔNG phải như 1 bộ đếm sửa đổi/nâng cấp tuần tự của cùng 1 thiết kế. Hướng khắc phục từng đề xuất trước đây — "gọi API `Products` của AMIS theo từng mã để lấy `id` số thật, dùng `id` đó phân biệt sản phẩm" — **sẽ KHÔNG giải quyết được vấn đề này**: mỗi 1 trong 7 biến thể của `SI08201` đã có sẵn 1 `product_code` (`.N`) khác nhau rồi (và do đó cũng sẽ có 1 `id` AMIS thật khác nhau) — việc gộp nhầm không xảy ra ở tầng "mã hàng nào ứng với `id` nào", mà xảy ra ở tầng cao hơn: khi `parseVersionSuffix` cắt bỏ hậu tố `.N` để tính ra `baseCode` DÙNG CHUNG cho cả 7 biến thể, hệ thống mặc định coi chúng là 1 chuỗi tiến hoá tuyến tính của cùng 1 sản phẩm. Cần 1 hướng khắc phục khác hẳn cho vấn đề này — vd: phát hiện khi tên của các phiên bản liền kề/gần nhau trong cùng `baseCode` khác biệt lớn và KHÔNG tự động coi là chuỗi phiên bản tuyến tính, hoặc duy trì 1 danh sách loại trừ thủ công các mã "mẫu in dùng chung cho nhiều khách" đã biết để không bao giờ tự động nhân bản nội dung cho các mã đó.
    - Ý nghĩa thực tế: hiện **chưa gây hại thật** vì `TCSPData`/`QCData` đang trống toàn hệ thống (chưa có nội dung nào bị kế thừa nhầm), nhưng đây giờ là 1 **hard gate đã ghi nhận chính thức**: giai đoạn quản lý nội dung (kế hoạch tiếp theo) **không được** triển khai tính năng tự động nhân bản nội dung qua các phiên bản (`cloneVersionContent`, mục 6 bước 5) cho lớp mã này mà không có ít nhất 1 trong 2: (a) cảnh báo "tên phiên bản trôi lớn" hiển thị cho MANAGER/ADMIN trước khi nhân bản, hoặc (b) cơ chế opt-in tường minh (Admin phải chủ động xác nhận mới nhân bản). Nếu Admin nhập nội dung TCSP/QC cho 1 phiên bản của `SI08201` rồi có đơn hàng mới tới với 1 khách hàng khác nhưng vẫn dùng mã `SI08201.8`, cơ chế hiện tại sẽ tự động kế thừa nhầm nội dung của khách hàng trước sang nếu không có 1 trong 2 biện pháp trên.
    - Lưu ý phụ — **đã sửa (2026-09-10, xem "Fix 1" trong final-fix-wave-report của kế hoạch này):** trước đây số thứ tự `versionNumber` (1, 2, 3…) phản ánh nhầm **thứ tự lần lượt được nhận diện trong lúc sync** (đơn hàng xử lý theo `modified_date` giảm dần) thay vì thứ tự số hậu tố `.N` thật do AMIS gán — vd chuỗi `SI06877` từng có `versionNumber=1` ứng với hậu tố thật `.9` và `versionNumber=2` ứng với `.10`, khiến `Product.currentVersion` trỏ vào bản ghi được xử lý SAU CÙNG trong sync chứ không phải bản có hậu tố `.N` lớn nhất — 1 lỗi đúng đắn nghiêm trọng vì giai đoạn quản lý nội dung sắp tới sẽ đọc/sửa "phiên bản hiện hành" dựa trên con trỏ này. Đã sửa: `versionNumber` giờ LUÔN LÀ đúng số hậu tố `.N` thật (xem mục 6 bước 5), và chỉ repoint `currentVersionId` khi số mới lớn hơn số hiện tại.
    - **Rủi ro liên quan nhưng KHÁC cơ chế — đã sửa riêng (2026-09-14):** cơ chế `existingWithSameNumber` (mục 6 bước 5) — khi 1 mã AMIS parse ra `versionNumber` TRÙNG với 1 phiên bản đã có sẵn cho cùng `baseCode` — trước đây bỏ qua hoàn toàn không dấu vết, ước tính ~24 mã thật bị ảnh hưởng lúc phát hiện (kể cả đúng ví dụ `AA03979` nêu trên: vì mã sau của chuỗi này trùng số hậu tố với 1 phiên bản đã có, nó bị cơ chế dedup âm thầm hấp thụ TRƯỚC KHI kịp tạo `ProductVersion` mới — nên với riêng `AA03979`, "hard gate" nói ở gạch đầu dòng dưới đây còn chưa kịp phát huy tác dụng). Đã sửa: giờ ghi log cảnh báo + đếm vào `SyncLog.duplicateVersionCodes`, hiển thị ở trang Đồng bộ AMIS. Đây CHỈ giải quyết phần "im lặng" — không giải quyết phần "hard gate" ở gạch đầu dòng tiếp theo, vẫn còn treo.

### 12.1. Giải pháp cho "hard gate" — phát hiện trôi tên phiên bản (đã brainstorm, chốt thiết kế 2026-09-14)

Đã brainstorm với anh Quân và chốt hướng xử lý cho hard gate nêu trên (mục (a): cảnh báo trước khi nhân bản). Quyết định:

- **Cơ chế phát hiện — heuristic tự động, không dùng danh sách loại trừ thủ công:** hàm `detectNameDrift(oldName, newName)` (đặt cùng `apps/worker/src/sync/version-detection.ts` — cùng mối quan tâm với `parseVersionSuffix`). Chuẩn hoá 2 chuỗi tên (chữ thường, tách theo ký tự không phải chữ/số, bỏ token rỗng), tính độ tương tự Jaccard = `|giao| / |hợp|` giữa 2 tập token. Dưới ngưỡng `NAME_DRIFT_THRESHOLD = 0.3` (hằng số export riêng để dễ tinh chỉnh, chọn dựa trên các ví dụ thật ở mục 12) → coi là "trôi tên lớn".
  - **Giới hạn đã biết (ceiling), chấp nhận có ghi chú rõ:** kiểu trôi như `SI08201` (7 phiên bản dùng chung 1 khuôn câu "Tem thùng hàng ...", chỉ đổi tên khách hàng ở cuối) sẽ KHÔNG bị heuristic word-overlap bắt chắc chắn — phần khuôn câu chung chiếm đa số token, độ tương tự vẫn cao. 4/5 ca đã biết khác (`SI06877`/`SI06878`, `SI00035`, `AA03979` — đổi hẳn sang mặt hàng khác, gần như không chung token) bắt được tốt. Rủi ro còn lại của riêng kiểu `SI08201` được giảm nhẹ một phần bởi cơ chế `duplicateVersionCodes` đã có (mục 12, gạch đầu dòng trên) — không phải giải pháp triệt để, nhưng đã ghi nhận chính thức là ceiling, nâng cấp sau nếu cần (vd thêm tín hiệu phụ nhận diện cụm viết hoa/tên riêng khác nhau).
- **Hành vi khi phát hiện trôi — vẫn nhân bản + gắn cờ, không để trống:** `cloneVersionContent` vẫn chạy như cũ (luôn có baseline nội dung, không ai bị chặn việc), nhưng `ProductVersion` mới được tạo với field mới `needsInheritanceReview: true` (thêm 1 cột boolean, không cần bảng mới) khi `detectNameDrift` phát hiện trôi — độc lập với việc bản mới có trở thành `currentVersion` hay không. Kèm 1 `ChangeLogEntry` (`fieldPath: "nameDrift"`, `oldValue`/`newValue` = 2 tên, `source: "AMIS_SYNC"`) để có vết audit — hiển thị "miễn phí" trong tab Lịch sử phiên bản vì UI đó đã lặp qua mọi `changeLogs` theo `fieldPath` chung.
- **Nơi hiển thị cảnh báo — ngay trong tab Lịch sử phiên bản, không có trang hàng đợi riêng:** `HistoryTab.tsx` hiện badge cảnh báo (vd "⚠ Cần xác nhận kế thừa") cạnh badge "Hiện hành" khi `v.needsInheritanceReview` true, kèm nút "Xác nhận đã kiểm tra" cho MANAGER/ADMIN. Không thêm trang admin mới, không sửa `SyncPanel`/`SyncLog` — quyết định có chủ đích ưu tiên đơn giản, đổi lấy việc không có view tổng hợp toàn hệ thống (MANAGER phải mở đúng mã hàng mới thấy cờ).
- **Xác nhận — endpoint mới, không chặn gì khác:** `PATCH /api/products/[baseCode]/versions/[versionNumber]/confirm-inheritance` (cùng khuôn `assertRole([MANAGER, ADMIN])` như `qc/route.ts`), set `needsInheritanceReview: false` + ghi `ChangeLogEntry` (`fieldPath: "inheritanceReviewConfirmed"`, `source: "MANUAL"`, `changedBy`). Cờ chỉ là cảnh báo — không disable/ẩn tab QC/TCSP, không chặn xuất Excel TCSP kể cả khi chưa xác nhận; đây là quyết định có chủ đích đổi lấy việc không làm gián đoạn workflow QC hiện có ở các mã không liên quan.

Việc còn lại: viết vào implementation plan (writing-plans) — thêm cột `needsInheritanceReview` vào `ProductVersion` (migration), hàm `detectNameDrift` + test đơn vị (dùng đúng các cặp tên thật ở mục 12), tích hợp vào `upsertProductFromAmis`, route `confirm-inheritance` + test, và badge/nút trong `HistoryTab.tsx`.

## 13. Lộ trình triển khai

1. Nền tảng: schema DB, đăng nhập 3 cấp quyền, khu quản trị cơ bản (dữ liệu mẫu nhập tay để dựng UI).
2. Tích hợp AMIS: OAuth, sync-worker, upsert, SyncLog.
3. Quản lý nội dung: trang chi tiết 5 tab, form sửa, upload media/tài liệu, xuất TCSP theo template.
4. Tìm kiếm & Danh sách mã hàng.
5. Kiểm thử, hoàn thiện giao diện, triển khai.
