#!/bin/bash
set -e

cd /opt/qc-hoanggia

echo "=== [1/3] Kéo mã nguồn mới nhất từ GitHub ==="
git fetch origin main
git reset --hard origin/main

echo "=== [2/3] Cập nhật CSDL PostgreSQL nếu cần ==="
docker exec -e PGPASSWORD=qc_dev_password infra-postgres-1 psql -U qc -d qc_hoanggia -c "ALTER TYPE \"UserRole\" ADD VALUE IF NOT EXISTS 'SALES_STAFF';" || true

echo "=== [3/3] Build và khởi động lại container Web ==="
docker compose -f infra/docker-compose.yml up -d --build web

echo "=== HOÀN TẤT CẬP NHẬT TRÊN VPS! ==="
