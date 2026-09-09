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
3. Với mỗi mã hàng xuất hiện, gọi Products API lấy `id` (→ `amisProductId`), `product_name`, `description` mới nhất.
4. **Nhận diện phiên bản:** áp quy tắc regex + điều kiện `baseCode` đã tồn tại nêu trên. Không khớp và `amisProductId` (field `id`) chưa từng thấy → coi là mã hàng hoàn toàn mới.
5. **Upsert** (không bao giờ tự động ghi đè nội dung QC do người dùng nhập):
   - Mã hoàn toàn mới → tạo `Product` (`status = PENDING_QC`) + `ProductVersion` số 1 rỗng nội dung.
   - Phiên bản mới nhận diện được → tạo `ProductVersion` kế thừa toàn bộ dữ liệu 4 mục từ phiên bản `isCurrent` trước đó, set phiên bản cũ `isCurrent = false`, ghi `ChangeLogEntry` nguồn `AMIS_SYNC` mô tả "phiên bản mới, chờ cập nhật nội dung".
   - Mã đã tồn tại, không có phiên bản mới → chỉ cập nhật/khởi tạo `ProductCustomer` (liên kết khách hàng + ngày đặt gần nhất).
   - Nếu tên/mô tả cơ bản từ AMIS khác dữ liệu đang lưu ở phiên bản hiện hành mà không phát sinh mã phiên bản mới → không tự sửa, chỉ gắn cờ để MANAGER/ADMIN xem xét (hiển thị trong trang danh sách).
6. Ghi 1 bản ghi `SyncLog` (số liệu tổng hợp + lỗi nếu có). Lỗi kết nối AMIS không làm crash worker; job dừng an toàn, log lỗi để xem trong khu quản trị.

**Phụ thuộc bên ngoài:** đã có sẵn `AMIS_APP_ID`/`AMIS_CLIENT_SECRET` (cùng cặp credential đang dùng cho đồng bộ đơn hàng ở hoanggia-crm), đã xác thực gọi API thật thành công. Lưu tại `infra/.env` (không commit git).

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

- ~~Định dạng dữ liệu Products thực tế từ AMIS chưa kiểm chứng~~ **Đã giải quyết (2026-09-09):** gọi thử API thật, xác nhận đầy đủ field cần dùng cho Products/SaleOrders/Customers (xem mục 6).
- ~~Quy ước đặt mã phiên bản `<baseCode>.<n>` chưa xác nhận~~ **Đã giải quyết một phần, phát hiện thêm rủi ro mới đã có cách xử lý (2026-09-09):** AMIS dùng dấu chấm cho 2 mục đích khác nhau; đã tìm ra quy tắc regex + điều kiện kép phân biệt chính xác 100% trên mẫu thật 1000 mã hàng (xem mục 6). Rủi ro còn lại: quy tắc này dựa trên 1000 mã quét được tại 1 thời điểm — nếu về sau AMIS xuất hiện kiểu mã mới không khớp cả 2 mẫu đã biết, sync sẽ coi nó là "mã hoàn toàn mới" (an toàn — không tự động ghi đè nhầm nội dung QC của mã khác, chỉ có thể bỏ sót việc nối phiên bản) thay vì gây lỗi.
- **Phạm vi dữ liệu:** khác với hoanggia-crm (chỉ đồng bộ đơn của nhân viên PKD1 đang quản lý), app QC cần **toàn bộ mã hàng của cả công ty** (mọi phòng kinh doanh, mọi khách hàng) trong năm 2026 — không lọc theo nhân viên/phòng ban. Cần chú ý khi viết lại logic đồng bộ, không copy nguyên bộ lọc `managedCodes` từ hoanggia-crm. Đã xác nhận qua dữ liệu thật: trường `organization_unit_name` trên SaleOrders cho thấy nhiều phòng ban khác nhau cùng ghi vào hệ thống AMIS (vd "Phòng kinh doanh I"), đúng như lường trước.
- **Foundation phase để lại việc chưa làm cần ưu tiên sớm ở phase này hoặc trước khi dùng thật:** chưa có tính năng đổi mật khẩu (`PATCH /api/me/password`) — tài khoản admin mặc định hiện không đổi được mật khẩu qua giao diện.

## 13. Lộ trình triển khai

1. Nền tảng: schema DB, đăng nhập 3 cấp quyền, khu quản trị cơ bản (dữ liệu mẫu nhập tay để dựng UI).
2. Tích hợp AMIS: OAuth, sync-worker, upsert, SyncLog.
3. Quản lý nội dung: trang chi tiết 5 tab, form sửa, upload media/tài liệu, xuất TCSP theo template.
4. Tìm kiếm & Danh sách mã hàng.
5. Kiểm thử, hoàn thiện giao diện, triển khai.
