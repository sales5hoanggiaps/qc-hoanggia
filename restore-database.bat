@echo off
chcp 65001 > nul
echo ==========================================================
echo   KHÔI PHỤC DỮ LIỆU QC HOÀNG GIA (POSTGRES + MINIO)
echo ==========================================================
echo.
echo 1. Đang kiểm tra container Postgres và MinIO...
docker compose -f infra/docker-compose.yml up -d postgres minio
echo Đợi 5 giây cho cơ sở dữ liệu sẵn sàng...
timeout /t 5 /nobreak > nul
echo.
echo 2. Đang nhập dữ liệu PostgreSQL từ file qc_hoanggia_backup.sql...
if exist "..\qc_hoanggia_backup.sql" (
    docker exec -i infra-postgres-1 psql -U qc -d qc_hoanggia < "..\qc_hoanggia_backup.sql"
    echo -> Đã nạp Database từ ..\qc_hoanggia_backup.sql thành công!
) else if exist "qc_hoanggia_backup.sql" (
    docker exec -i infra-postgres-1 psql -U qc -d qc_hoanggia < "qc_hoanggia_backup.sql"
    echo -> Đã nạp Database từ qc_hoanggia_backup.sql thành công!
) else (
    echo [CANH BAO] Khong tim thay file qc_hoanggia_backup.sql!
)
echo.
echo 3. Đang chép lại file/ảnh MinIO...
if exist "..\qc_minio_data_backup\qc-hoanggia" (
    docker cp "..\qc_minio_data_backup\." infra-minio-1:/data/
    echo -> Đã khôi phục dữ liệu MinIO thành công!
) else if exist "qc_minio_data_backup\qc-hoanggia" (
    docker cp "qc_minio_data_backup\." infra-minio-1:/data/
    echo -> Đã khôi phục dữ liệu MinIO thành công!
) else (
    echo [CANH BAO] Khong tim thay thu muc qc_minio_data_backup!
)
echo.
echo ==========================================================
echo   HOÀN TẤT KHÔI PHỤC DỮ LIỆU!
echo ==========================================================
pause
