#!/bin/bash
set -e

echo "=== [1/4] Tạo cấu hình Nginx cho qc.103-149-170-221.sslip.io ==="
sudo tee /etc/nginx/sites-available/qc-hoanggia > /dev/null << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name qc.103-149-170-221.sslip.io;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
}
EOF

echo "=== [2/4] Kích hoạt site và kiểm tra Nginx syntax ==="
sudo ln -sf /etc/nginx/sites-available/qc-hoanggia /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

echo "=== [3/4] Cấp chứng chỉ SSL HTTPS miễn phí Let's Encrypt (Certbot) ==="
sudo certbot --nginx -d qc.103-149-170-221.sslip.io --non-interactive --agree-tos --register-unsafely-without-email --redirect || sudo certbot --nginx -d qc.103-149-170-221.sslip.io --redirect

echo "=== [4/4] Cập nhật phiên bản web mới nhất và PWA icon ==="
git pull origin main || true
docker compose -f infra/docker-compose.yml up -d --build web || true

echo "=== HOÀN TẤT! ==="
echo "Bạn có thể truy cập ngay: https://qc.103-149-170-221.sslip.io"
