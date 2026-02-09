#!/bin/bash
# รันบน VPS เมื่อต้องการอัปเดตเว็บ (หลัง git pull หรือจาก webhook)
# ใช้: ./deploy.sh หรือ bash deploy.sh

set -e

# โฟลเดอร์โปรเจกต์บน VPS (ตรงกับโฟลเดอร์จริงบนเซิร์ฟเวอร์.)
APP_DIR="${APP_DIR:-/home/panat/apps/chh-ticket}"
# ชื่อ process ใน pm2 — ต้องตรงกับชื่อที่ใช้ใน deploy-auto.sh
PM2_APP_NAME="${PM2_APP_NAME:-chh-ticket}"

echo "[$(date)] Deploy started in $APP_DIR"

cd "$APP_DIR" || exit 1

echo ">>> git pull"
git pull

echo ">>> npm ci"
npm ci

echo ">>> npm run build"
npm run build

# รีสตาร์ทแอป (เลือกอย่างใดอย่างหนึ่ง)
if command -v pm2 &> /dev/null; then
  echo ">>> pm2 restart $PM2_APP_NAME"
  pm2 restart "$PM2_APP_NAME" --update-env
else
  echo ">>> ไม่พบ pm2 — ถ้ารันด้วย systemd หรืออื่นๆ ให้รีสตาร์ท service เอง"
  # ตัวอย่าง systemd: sudo systemctl restart chh
fi

echo "[$(date)] Deploy finished OK"
