@echo off
chcp 65001 > nul
echo ==========================================================
echo   KHỞI ĐỘNG HỆ THỐNG QC HOÀNG GIA TRÊN DOCKER (PORT 3100)
echo ==========================================================
echo.
echo Đang bật các container Docker (Web, Worker, Postgres, MinIO)...
docker compose -f infra/docker-compose.yml up -d --build
echo.
echo Kiểm tra trạng thái container:
docker compose -f infra/docker-compose.yml ps
echo.
echo ==========================================================
echo   Ứng dụng đang chạy tại:
echo   - Giao diện Web QC: http://localhost:3100
echo   - MinIO Console:    http://localhost:9001 (qc_minio / qc_minio_password)
echo   - Postgres:         localhost:5433 (user: qc, db: qc_hoanggia)
echo ==========================================================
pause
