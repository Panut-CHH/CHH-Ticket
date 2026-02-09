#!/bin/bash

# 🛑 Script สำหรับปิด Caddy และ Nginx (ก่อนใช้ Cloudflare Tunnel)

set -e

# สีสำหรับ output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}🛑 ปิด Caddy และ Nginx${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# 1. เช็คว่ามี service อะไรรันอยู่
echo -e "${YELLOW}🔍 เช็ค service ที่รันอยู่...${NC}"
echo ""

# เช็ค Caddy
if systemctl is-active --quiet caddy 2>/dev/null; then
    echo -e "${YELLOW}⚠️  พบ Caddy กำลังทำงาน${NC}"
    CADDY_RUNNING=true
else
    echo -e "${GREEN}✅ Caddy ไม่ได้ทำงาน${NC}"
    CADDY_RUNNING=false
fi

# เช็ค Nginx
if systemctl is-active --quiet nginx 2>/dev/null; then
    echo -e "${YELLOW}⚠️  พบ Nginx กำลังทำงาน${NC}"
    NGINX_RUNNING=true
else
    echo -e "${GREEN}✅ Nginx ไม่ได้ทำงาน${NC}"
    NGINX_RUNNING=false
fi

echo ""

# ถ้าไม่มี service รันอยู่
if [ "$CADDY_RUNNING" = "false" ] && [ "$NGINX_RUNNING" = "false" ]; then
    echo -e "${GREEN}✅ ไม่มี service ที่ต้องปิด${NC}"
    echo ""
    echo -e "${BLUE}💡 พร้อมใช้ Cloudflare Tunnel แล้ว!${NC}"
    exit 0
fi

# 2. ยืนยันก่อนปิด
echo -e "${YELLOW}⚠️  คุณต้องการปิด service เหล่านี้หรือไม่?${NC}"
echo ""
if [ "$CADDY_RUNNING" = "true" ]; then
    echo "   - Caddy"
fi
if [ "$NGINX_RUNNING" = "true" ]; then
    echo "   - Nginx"
fi
echo ""
read -p "ปิด service เหล่านี้? (y/n) [default: y]: " confirm
confirm=${confirm:-y}

if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo -e "${YELLOW}⚠️  ยกเลิกการปิด service${NC}"
    exit 0
fi

echo ""

# 3. ปิด Caddy
if [ "$CADDY_RUNNING" = "true" ]; then
    echo -e "${YELLOW}🛑 กำลังปิด Caddy...${NC}"
    
    # Stop service
    sudo systemctl stop caddy 2>&1 || {
        echo -e "${RED}❌ ปิด Caddy ไม่สำเร็จ${NC}"
    }
    
    # Disable auto-start
    sudo systemctl disable caddy 2>&1 || {
        echo -e "${YELLOW}⚠️  Disable Caddy ไม่สำเร็จ (อาจไม่ได้ enable ไว้)${NC}"
    }
    
    # เช็คสถานะ
    if systemctl is-active --quiet caddy 2>/dev/null; then
        echo -e "${RED}❌ Caddy ยังทำงานอยู่${NC}"
    else
        echo -e "${GREEN}✅ ปิด Caddy แล้ว${NC}"
    fi
    echo ""
fi

# 4. ปิด Nginx
if [ "$NGINX_RUNNING" = "true" ]; then
    echo -e "${YELLOW}🛑 กำลังปิด Nginx...${NC}"
    
    # Stop service
    sudo systemctl stop nginx 2>&1 || {
        echo -e "${RED}❌ ปิด Nginx ไม่สำเร็จ${NC}"
    }
    
    # Disable auto-start
    sudo systemctl disable nginx 2>&1 || {
        echo -e "${YELLOW}⚠️  Disable Nginx ไม่สำเร็จ (อาจไม่ได้ enable ไว้)${NC}"
    }
    
    # เช็คสถานะ
    if systemctl is-active --quiet nginx 2>/dev/null; then
        echo -e "${RED}❌ Nginx ยังทำงานอยู่${NC}"
    else
        echo -e "${GREEN}✅ ปิด Nginx แล้ว${NC}"
    fi
    echo ""
fi

# 5. เช็ค port 80/443
echo -e "${YELLOW}🔍 เช็ค port 80/443...${NC}"

PORT_80_IN_USE=false
PORT_443_IN_USE=false

if command -v lsof &> /dev/null; then
    if sudo lsof -i :80 -sTCP:LISTEN >/dev/null 2>&1; then
        PORT_80_IN_USE=true
        PORT_80_PROCESS=$(sudo lsof -i :80 -sTCP:LISTEN | tail -n 1 | awk '{print $2}')
        echo -e "${YELLOW}⚠️  Port 80 ยังถูกใช้โดย process $PORT_80_PROCESS${NC}"
    else
        echo -e "${GREEN}✅ Port 80 ว่างแล้ว${NC}"
    fi
    
    if sudo lsof -i :443 -sTCP:LISTEN >/dev/null 2>&1; then
        PORT_443_IN_USE=true
        PORT_443_PROCESS=$(sudo lsof -i :443 -sTCP:LISTEN | tail -n 1 | awk '{print $2}')
        echo -e "${YELLOW}⚠️  Port 443 ยังถูกใช้โดย process $PORT_443_PROCESS${NC}"
    else
        echo -e "${GREEN}✅ Port 443 ว่างแล้ว${NC}"
    fi
fi

echo ""

# 6. สรุปผล
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}✅ เสร็จสิ้น!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""

if [ "$CADDY_RUNNING" = "true" ] || [ "$NGINX_RUNNING" = "true" ]; then
    echo -e "${GREEN}✅ ปิด service แล้ว${NC}"
    echo ""
fi

if [ "$PORT_80_IN_USE" = "true" ] || [ "$PORT_443_IN_USE" = "true" ]; then
    echo -e "${YELLOW}⚠️  ยังมี process อื่นใช้ port 80/443 อยู่${NC}"
    echo -e "${YELLOW}💡 ถ้าต้องการใช้ Cloudflare Tunnel ไม่ต้องกังวล (ไม่ต้องใช้ port 80/443)${NC}"
    echo ""
fi

echo -e "${BLUE}📝 ขั้นตอนต่อไป:${NC}"
echo "   1. รอ nameserver propagation (1-24 ชั่วโมง)"
echo "   2. หลังจาก nameserver propagate แล้ว รัน: ./deploy-auto.sh"
echo "   3. Script จะตั้งค่า Cloudflare Tunnel ให้อัตโนมัติ"
echo ""

echo -e "${BLUE}📋 คำสั่งที่มีประโยชน์:${NC}"
echo "   - เช็คสถานะ Caddy: sudo systemctl status caddy"
echo "   - เช็คสถานะ Nginx: sudo systemctl status nginx"
echo "   - เช็ค port 80/443: sudo lsof -i :80 -i :443"
echo ""

echo -e "${GREEN}🎉 พร้อมใช้ Cloudflare Tunnel แล้ว!${NC}"
