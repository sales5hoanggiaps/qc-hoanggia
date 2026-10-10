@echo off
chcp 65001 > nul
echo ==========================================================
echo   SAO LƯU CƠ SỞ DỮ LIỆU QC HOÀNG GIA (POSTGRES + MINIO)
echo ==========================================================
echo.
echo 1. Đang xuất Database PostgreSQL...
docker exec infra-postgres-1 pg_dump -U qc qc_hoanggia > "..\qc_hoanggia_backup.sql"
echo -> Đã lưu file: D:\Mr Quân\qc_hoanggia_backup.sql
echo.
echo 2. Đang sao lưu file đính kèm/hình ảnh MinIO...
docker cp infra-minio-1:/data "..\qc_minio_data_backup"
echo -> Đã lưu thư mục: D:\Mr Quân\qc_minio_data_backup
echo.
echo ==========================================================
echo   ĐÃ HOÀN TẤT SAO LƯU DỮ LIỆU THÀNH CÔNG!
echo ==========================================================
pause
