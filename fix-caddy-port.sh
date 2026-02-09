#!/bin/bash

# 🔧 Script สำหรับแก้ไข Caddyfile ให้ proxy ไปที่ port ที่ถูกต้อง

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}🔧 แก้ไข Caddyfile${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# รับ input
read -p "PM2 app name (เช่น: chh-ticket) [default: chh-ticket]: " APP_NAME
APP_NAME=${APP_NAME:-chh-ticket}

read -p "Caddy port (default: 8443): " CADDY_PORT
CADDY_PORT=${CADDY_PORT:-8443}

echo ""
echo -e "${YELLOW}🔍 หา port ที่ PM2 app ใช้...${NC}"

# หา port จาก ecosystem.config.js
APP_DIR="$HOME/apps/$APP_NAME"
PM2_PORT=""

if [ -f "$APP_DIR/ecosystem.config.js" ]; then
    PM2_PORT=$(grep -i "port" "$APP_DIR/ecosystem.config.js" | grep -oE "[0-9]+" | head -1)
elif [ -f "$APP_DIR/ecosystem.config.cjs" ]; then
    PM2_PORT=$(grep -i "port" "$APP_DIR/ecosystem.config.cjs" | grep -oE "[0-9]+" | head -1)
fi

# หา port จาก .env
if [ -z "$PM2_PORT" ] && [ -f "$APP_DIR/.env" ]; then
    PM2_PORT=$(grep -i "PORT" "$APP_DIR/.env" | cut -d= -f2 | tr -d '"' | tr -d "'" | head -1)
fi

# หา port จาก PM2 env
if [ -z "$PM2_PORT" ] && command -v pm2 &> /dev/null; then
    PM2_PORT=$(pm2 jlist 2>/dev/null | grep -o '"PORT":"[0-9]*"' | head -1 | grep -o '[0-9]*' || echo "")
fi

# ทดสอบ port ต่างๆ
if [ -z "$PM2_PORT" ]; then
    echo -e "${YELLOW}⚠️  ไม่พบ PORT ใน config - ทดสอบ port ต่างๆ...${NC}"
    
    for port in 3000 3001 3002 3003; do
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:$port | grep -q "200\|301\|302"; then
            PM2_PORT=$port
            echo -e "${GREEN}✅ พบ app ที่ port: $port${NC}"
            break
        fi
    done
fi

if [ -z "$PM2_PORT" ]; then
    echo -e "${RED}❌ ไม่พบ port ที่ app ใช้${NC}"
    read -p "กรุณาใส่ port ที่ PM2 app ใช้: " PM2_PORT
fi

if [ -z "$PM2_PORT" ]; then
    echo -e "${RED}❌ ไม่สามารถหา port ได้${NC}"
    exit 1
fi

echo -e "${GREEN}✅ PM2 app ใช้ port: $PM2_PORT${NC}"

# ทดสอบ localhost
echo -e "${YELLOW}🔍 ทดสอบ localhost:$PM2_PORT...${NC}"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:$PM2_PORT | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✅ App ตอบสนองที่ localhost:$PM2_PORT${NC}"
else
    echo -e "${RED}❌ App ไม่ตอบสนองที่ localhost:$PM2_PORT${NC}"
    echo -e "${YELLOW}💡 ลอง restart app: pm2 restart $APP_NAME${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}🔧 แก้ไข Caddyfile...${NC}"

# Backup Caddyfile
if [ -f "/etc/caddy/Caddyfile" ]; then
    sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup.$(date +%Y%m%d_%H%M%S)
    echo -e "${GREEN}✅ Backup Caddyfile แล้ว${NC}"
fi

# แก้ไข Caddyfile
CADDYFILE="/etc/caddy/Caddyfile"

# ลบ config เก่าที่เกี่ยวกับ :8443
sudo sed -i '/^:8443 {/,/^}/d' "$CADDYFILE" 2>/dev/null || true

# เพิ่ม config ใหม่
sudo tee -a "$CADDYFILE" > /dev/null << EOF

# Config for $APP_NAME (via Nginx/Apache proxy)
:$CADDY_PORT {
    reverse_proxy localhost:$PM2_PORT
}
EOF

echo -e "${GREEN}✅ แก้ไข Caddyfile แล้ว${NC}"

# Validate config
echo -e "${YELLOW}🔍 Validate Caddyfile...${NC}"
if sudo caddy validate --config "$CADDYFILE" 2>&1; then
    echo -e "${GREEN}✅ Caddyfile ถูกต้อง${NC}"
    
    # Reload Caddy
    echo -e "${YELLOW}🔄 Reload Caddy...${NC}"
    if timeout 10 sudo systemctl reload caddy 2>&1; then
        echo -e "${GREEN}✅ Reload Caddy แล้ว${NC}"
        
        # ทดสอบ
        sleep 2
        echo -e "${YELLOW}🔍 ทดสอบ localhost:$CADDY_PORT...${NC}"
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:$CADDY_PORT | grep -q "200\|301\|302\|404"; then
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$CADDY_PORT)
            echo -e "${GREEN}✅ Caddy ตอบสนองที่ localhost:$CADDY_PORT (HTTP $HTTP_CODE)${NC}"
        else
            echo -e "${YELLOW}⚠️  Caddy ยังไม่ตอบสนอง - รอสักครู่แล้วลองใหม่${NC}"
        fi
    else
        echo -e "${RED}❌ Reload Caddy ล้มเหลว${NC}"
        echo -e "${YELLOW}💡 ลอง: sudo systemctl restart caddy${NC}"
    fi
else
    echo -e "${RED}❌ Caddyfile มีปัญหา${NC}"
    echo -e "${YELLOW}💡 Restore backup: sudo cp /etc/caddy/Caddyfile.backup.* /etc/caddy/Caddyfile${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}🎉 แก้ไขเสร็จสิ้น!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
echo "📊 ข้อมูล:"
echo "   - PM2 app: $APP_NAME"
echo "   - PM2 port: $PM2_PORT"
echo "   - Caddy port: $CADDY_PORT"
echo ""
echo "📝 คำสั่งที่มีประโยชน์:"
echo "   - ทดสอบ Caddy: curl http://localhost:$CADDY_PORT"
echo "   - ทดสอบ App: curl http://localhost:$PM2_PORT"
echo "   - Caddy status: sudo systemctl status caddy"
echo "   - Caddy logs: sudo journalctl -u caddy -f"
echo ""
