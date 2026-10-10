@echo off
chcp 65001 > nul
echo Đang tắt hệ thống QC Hoàng Gia (Docker)...
docker compose -f infra/docker-compose.yml down
echo Đã tắt hoàn tất!
pause
