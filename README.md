# QC Hoàng Gia

Web app tra cứu Tiêu chuẩn sản phẩm / QC / Đóng gói / Giấy tờ cho bộ phận QC — độc lập với hoanggia-crm.

## Chạy local

```bash
npm install
docker compose -f infra/docker-compose.yml up -d postgres
cp infra/.env.example infra/.env   # rồi điền DATABASE_URL, AUTH_SECRET, AMIS_APP_ID, AMIS_CLIENT_SECRET
npm run prisma:migrate -- --name init
npm run db:seed
npm run dev
```

Đăng nhập lần đầu: `admin` / `DoiMatKhauNgay!2026` (đổi ngay sau khi đăng nhập).

## Chạy toàn bộ qua Docker

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

## Test

```bash
npm test
```

## Tài liệu

- Spec: [docs/superpowers/specs/2026-09-09-qc-hoanggia-design.md](docs/superpowers/specs/2026-09-09-qc-hoanggia-design.md)
- Plan (Foundation): [docs/superpowers/plans/2026-09-09-foundation.md](docs/superpowers/plans/2026-09-09-foundation.md)
