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
    echo [UTF-8] Đang làm sạch schema cũ và sao chép file backup vào container...
    docker exec infra-postgres-1 psql -U qc -d qc_hoanggia -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO qc; GRANT ALL ON SCHEMA public TO public;"
    docker cp "..\qc_hoanggia_backup.sql" infra-postgres-1:/tmp/restore.sql
    docker exec infra-postgres-1 psql -U qc -d qc_hoanggia -f /tmp/restore.sql
    docker exec infra-postgres-1 rm -f /tmp/restore.sql
    echo -> Đã nạp Database từ ..\qc_hoanggia_backup.sql thành công (chuẩn UTF-8)!
) else if exist "qc_hoanggia_backup.sql" (
    echo [UTF-8] Đang làm sạch schema cũ và sao chép file backup vào container...
    docker exec infra-postgres-1 psql -U qc -d qc_hoanggia -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO qc; GRANT ALL ON SCHEMA public TO public;"
    docker cp "qc_hoanggia_backup.sql" infra-postgres-1:/tmp/restore.sql
    docker exec infra-postgres-1 psql -U qc -d qc_hoanggia -f /tmp/restore.sql
    docker exec infra-postgres-1 rm -f /tmp/restore.sql
    echo -> Đã nạp Database từ qc_hoanggia_backup.sql thành công (chuẩn UTF-8)!
) else (
    echo [CANH BAO] Khong tim thay file qc_hoanggia_backup.sql!
)
echo.
echo 3. Đang chép lại file/ảnh MinIO...
if exist "..\qc_minio_data_backup\qc-hoanggia" (
    docker cp "..\qc_minio_data_backup\." infra-minio-1:/data/
    docker restart infra-minio-1 > nul
    echo -> Đã khôi phục dữ liệu MinIO thành công!
) else if exist "qc_minio_data_backup\qc-hoanggia" (
    docker cp "qc_minio_data_backup\." infra-minio-1:/data/
    docker restart infra-minio-1 > nul
    echo -> Đã khôi phục dữ liệu MinIO thành công!
) else (
    echo [CANH BAO] Khong tim thay thu muc qc_minio_data_backup!
)
echo.
echo ==========================================================
echo   HOÀN TẤT KHÔI PHỤC DỮ LIỆU!
echo ==========================================================
pause
