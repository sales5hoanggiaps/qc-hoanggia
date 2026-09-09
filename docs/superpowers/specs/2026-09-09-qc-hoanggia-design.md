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

**Xác thực:** `sync-worker` giữ `client_id`/`client_secret` (biến môi trường, không lộ ra frontend) do công ty đăng ký trên cổng Open API của MISA, lấy `access_token` (hiệu lực 24h), tự làm mới khi hết hạn.

**Kích hoạt:** cron hằng đêm (mặc định 02:00) + endpoint nội bộ gọi bởi nút "Đồng bộ ngay" (chỉ MANAGER/ADMIN thấy nút này).

**Các bước mỗi lần chạy:**
1. Gọi SaleOrders API, lọc đơn hàng có ngày đặt trong năm 2026 (phân trang cho tới hết).
2. Từ mỗi đơn hàng, rút ra: mã hàng (amisProductId), khách hàng (amisCustomerId), ngày đặt.
3. Với mỗi mã hàng xuất hiện, gọi Products API lấy tên/mô tả cơ bản mới nhất.
4. **Nhận diện phiên bản:** nếu mã AMIS có dạng `<baseCode>.<n>` và `baseCode` đã tồn tại trong hệ thống → coi là phiên bản mới của `baseCode` đó; nếu không khớp mẫu này và chưa từng thấy `amisProductId` → coi là mã hàng hoàn toàn mới.
5. **Upsert** (không bao giờ tự động ghi đè nội dung QC do người dùng nhập):
   - Mã hoàn toàn mới → tạo `Product` (`status = PENDING_QC`) + `ProductVersion` số 1 rỗng nội dung.
   - Phiên bản mới nhận diện được → tạo `ProductVersion` kế thừa toàn bộ dữ liệu 4 mục từ phiên bản `isCurrent` trước đó, set phiên bản cũ `isCurrent = false`, ghi `ChangeLogEntry` nguồn `AMIS_SYNC` mô tả "phiên bản mới, chờ cập nhật nội dung".
   - Mã đã tồn tại, không có phiên bản mới → chỉ cập nhật/khởi tạo `ProductCustomer` (liên kết khách hàng + ngày đặt gần nhất).
   - Nếu tên/mô tả cơ bản từ AMIS khác dữ liệu đang lưu ở phiên bản hiện hành mà không phát sinh mã phiên bản mới → không tự sửa, chỉ gắn cờ để MANAGER/ADMIN xem xét (hiển thị trong trang danh sách).
6. Ghi 1 bản ghi `SyncLog` (số liệu tổng hợp + lỗi nếu có). Lỗi kết nối AMIS không làm crash worker; job dừng an toàn, log lỗi để xem trong khu quản trị.

**Phụ thuộc bên ngoài quan trọng:** công ty cần đăng ký ứng dụng trên cổng Open API của MISA AMIS CRM để được cấp `client_id`/`client_secret` thật trước khi tích hợp có thể hoạt động ([tài liệu MISA](https://www.misa.vn/154981/tong-quan-open-api-misa-crm/)). Đây là việc anh Quân/IT cần chủ động liên hệ MISA, không nằm trong phạm vi code của dự án.

## 7. Quản lý nội dung 4 mục & Media

- Trang chi tiết mã hàng có 5 tab: **Tiêu chuẩn sản phẩm, QC sản phẩm, Quy cách đóng gói, Giấy tờ sản phẩm, Lịch sử phiên bản** — luôn hiển thị `currentVersion`, có link chuyển sang xem phiên bản cũ (chỉ đọc, không sửa được phiên bản cũ).
- MANAGER/ADMIN sửa nội dung qua form riêng cho từng tab; mỗi lần lưu thay đổi ghi thêm `ChangeLogEntry` nguồn `MANUAL` (field, giá trị cũ/mới, người sửa).
- Mỗi tab TCSP/QC/Đóng gói có khu upload nhiều ảnh/video (`MediaAsset`), có chú thích + sắp xếp thứ tự; tab Giấy tờ sản phẩm upload file tài liệu phân loại COA/MSDS/ROHS/Khác (`ProductDocument`).
- Upload qua presigned URL lên object storage (client upload thẳng, tránh tải qua server app); giới hạn ảnh ~10MB, video ~200MB (mp4).
- Xem/tải file: server sinh link ký hết hạn ngắn (vài phút) mỗi khi trang được mở bởi người dùng đã đăng nhập — không có link công khai vĩnh viễn.

## 8. Xuất file TCSP theo form Hoàng Gia

- Giữ file `TCSP HOÀNG GIA.xlsx` gốc làm template (giữ nguyên khung, logo, định dạng ô).
- Khi bấm "Tải TCSP" ở tab Tiêu chuẩn sản phẩm: server dùng thư viện đọc/ghi Excel (giữ style, vd `exceljs`) mở template, điền dữ liệu phiên bản hiện hành (mã, tên, mô tả, mã NL, các dòng trong `TCSPSpecRow` theo đúng nhóm Kích thước/TC khác, người lập/duyệt/ngày duyệt) vào đúng vị trí ô đã xác định sẵn, xuất file `.xlsx` để tải về.
- Xuất PDF: ngoài phạm vi v1 (mục 2), để ngỏ cho giai đoạn sau.

## 9. Tìm kiếm & Danh sách mã hàng

- **Trang tìm kiếm (trang chủ):** 1 ô tìm kiếm, chấp nhận mã gốc hoặc mã có version, và tên khách hàng; so khớp gần đúng không phân biệt hoa/thường bằng Postgres `ILIKE` (đủ dùng ở quy mô vài nghìn mã hàng, không cần công cụ tìm kiếm ngoài). Tìm theo khách hàng trả về toàn bộ mã hàng của khách đó.
- **Trang Danh sách mã hàng:** bảng Mã hàng / Tên hàng hoá / Loại sản phẩm / Trạng thái, lọc theo Loại sản phẩm và Trạng thái (đặc biệt lọc nhanh các mã `PENDING_QC` cần bổ sung), có phân trang.
- Click vào 1 dòng kết quả (ở cả 2 trang) → mở trang chi tiết mã hàng (5 tab).

## 10. Hạ tầng, triển khai, vận hành

- Docker Compose: `web`, `sync-worker`, `postgres`, `nginx`, (+ `minio` nếu chọn tự host object storage thay vì Cloudflare R2 — quyết định khi chọn nơi triển khai).
- Biến môi trường nhạy cảm (AMIS client_id/secret, DB URL, khoá storage, session secret) qua `.env`, không commit.
- Thiết kế portable: không phụ thuộc vị trí máy chủ cụ thể — có thể chạy trên VPS Hostinger hiện tại (stack Docker tách biệt CRM) hoặc VPS mới, tuỳ quyết định sau của anh Quân.

## 11. Kiểm thử

- Unit test cho logic upsert đồng bộ AMIS (nhận diện mã mới / phiên bản mới / chỉ cập nhật liên kết khách hàng), đặc biệt test mẫu nhận diện `<baseCode>.<n>`.
- Unit test cho việc điền dữ liệu vào template Excel TCSP (đúng ô, đúng số dòng khi số lượng `TCSPSpecRow` thay đổi).
- Test phân quyền: đảm bảo QC_STAFF không gọi được API sửa nội dung/upload/quản lý tài khoản.
- Test tích hợp: đăng nhập → tìm kiếm → mở chi tiết → xem đúng 5 tab → tải TCSP ra file hợp lệ.

## 12. Rủi ro & phụ thuộc bên ngoài

- **Phụ thuộc MISA cấp client_id/secret Open API** — chặn toàn bộ phần đồng bộ nếu chưa có; nên xin sớm.
- **Định dạng dữ liệu SaleOrders/Products thực tế từ AMIS** chưa được kiểm chứng chi tiết (mới xác nhận qua tài liệu tổng quan) — khi có thông tin đăng nhập/API thật, cần gọi thử để xác nhận đúng field trước khi hoàn thiện code đồng bộ; có thể phát sinh điều chỉnh nhỏ ở bước upsert.
- **Quy ước đặt mã phiên bản** (`<baseCode>.<n>`) dựa trên mô tả của anh Quân — cần xác nhận lại thực tế trong AMIS luôn tuân thủ đúng mẫu này để nhận diện tự động chính xác.

## 13. Lộ trình triển khai

1. Nền tảng: schema DB, đăng nhập 3 cấp quyền, khu quản trị cơ bản (dữ liệu mẫu nhập tay để dựng UI).
2. Tích hợp AMIS: OAuth, sync-worker, upsert, SyncLog.
3. Quản lý nội dung: trang chi tiết 5 tab, form sửa, upload media/tài liệu, xuất TCSP theo template.
4. Tìm kiếm & Danh sách mã hàng.
5. Kiểm thử, hoàn thiện giao diện, triển khai.
