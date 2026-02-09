#!/bin/bash

# 🔍 Script สำหรับ Debug ปัญหา 404

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}🔍 Debug ปัญหา 404${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# รับ domain
read -p "Domain (เช่น: chh-ticket.ervergreenchh.tech): " DOMAIN
DOMAIN=${DOMAIN:-chh-ticket.ervergreenchh.tech}

echo ""
echo -e "${YELLOW}🔍 1. เช็ค PM2 App...${NC}"
if command -v pm2 &> /dev/null; then
    PM2_LIST=$(pm2 list 2>/dev/null)
    if [ -n "$PM2_LIST" ]; then
        echo "$PM2_LIST"
        echo ""
        
        # เช็ค port ที่ใช้
        PM2_PORT=$(pm2 jlist 2>/dev/null | grep -o '"PORT":"[0-9]*"' | head -1 | grep -o '[0-9]*' || echo "")
        if [ -n "$PM2_PORT" ]; then
            echo -e "${GREEN}✅ PM2 App ใช้ port: $PM2_PORT${NC}"
            
            # ทดสอบ localhost
            echo -e "${YELLOW}   ทดสอบ: curl http://localhost:$PM2_PORT${NC}"
            if curl -s -o /dev/null -w "%{http_code}" http://localhost:$PM2_PORT | grep -q "200\|301\|302"; then
                echo -e "${GREEN}   ✅ App ตอบสนองที่ localhost:$PM2_PORT${NC}"
            else
                echo -e "${RED}   ❌ App ไม่ตอบสนองที่ localhost:$PM2_PORT${NC}"
            fi
        else
            echo -e "${YELLOW}   ⚠️  ไม่พบ PORT ใน PM2 config${NC}"
        fi
    else
        echo -e "${RED}❌ ไม่มี PM2 processes${NC}"
    fi
else
    echo -e "${RED}❌ PM2 ไม่พบ${NC}"
fi

echo ""
echo -e "${YELLOW}🔍 2. เช็ค Caddy...${NC}"
if command -v caddy &> /dev/null; then
    if systemctl is-active --quiet caddy 2>/dev/null; then
        echo -e "${GREEN}✅ Caddy ทำงานอยู่${NC}"
        
        # เช็ค Caddyfile
        if [ -f "/etc/caddy/Caddyfile" ]; then
            echo -e "${YELLOW}   Caddyfile:${NC}"
            sudo cat /etc/caddy/Caddyfile | grep -A 5 "8443\|443" || echo "   ไม่พบ config สำหรับ port 8443/443"
        fi
        
        # เช็ค port 8443
        if sudo lsof -i :8443 -sTCP:LISTEN >/dev/null 2>&1; then
            echo -e "${GREEN}   ✅ Caddy listen port 8443${NC}"
            
            # ทดสอบ localhost:8443
            echo -e "${YELLOW}   ทดสอบ: curl http://localhost:8443${NC}"
            if curl -s -o /dev/null -w "%{http_code}" http://localhost:8443 | grep -q "200\|301\|302\|404"; then
                HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8443)
                echo -e "${GREEN}   ✅ Caddy ตอบสนองที่ localhost:8443 (HTTP $HTTP_CODE)${NC}"
            else
                echo -e "${RED}   ❌ Caddy ไม่ตอบสนองที่ localhost:8443${NC}"
            fi
        else
            echo -e "${RED}   ❌ Caddy ไม่ listen port 8443${NC}"
        fi
    else
        echo -e "${RED}❌ Caddy ไม่ทำงาน${NC}"
    fi
else
    echo -e "${RED}❌ Caddy ไม่พบ${NC}"
fi

echo ""
echo -e "${YELLOW}🔍 3. เช็ค Nginx...${NC}"
if command -v nginx &> /dev/null; then
    if systemctl is-active --quiet nginx 2>/dev/null; then
        echo -e "${GREEN}✅ Nginx ทำงานอยู่${NC}"
        
        # เช็ค config
        SITE_NAME=$(echo "$DOMAIN" | cut -d. -f1)
        if [ -f "/etc/nginx/sites-available/$SITE_NAME" ]; then
            echo -e "${YELLOW}   Nginx config:${NC}"
            sudo cat /etc/nginx/sites-available/$SITE_NAME | head -20
        fi
        
        # เช็ค port ที่ listen
        NGINX_PORTS=$(sudo lsof -i -P -n | grep nginx | grep LISTEN | awk '{print $9}' | cut -d: -f2 | sort -u)
        if [ -n "$NGINX_PORTS" ]; then
            echo -e "${GREEN}   ✅ Nginx listen ports: $NGINX_PORTS${NC}"
        else
            echo -e "${RED}   ❌ Nginx ไม่ listen port ใดๆ${NC}"
        fi
    else
        echo -e "${RED}❌ Nginx ไม่ทำงาน${NC}"
    fi
else
    echo -e "${RED}❌ Nginx ไม่พบ${NC}"
fi

echo ""
echo -e "${YELLOW}🔍 4. เช็ค Traefik...${NC}"
if command -v docker &> /dev/null; then
    TRAEFIK_CONTAINER=$(sudo docker ps --format "{{.Names}}" | grep -i traefik || echo "")
    if [ -n "$TRAEFIK_CONTAINER" ]; then
        echo -e "${GREEN}✅ Traefik ทำงานอยู่ (container: $TRAEFIK_CONTAINER)${NC}"
        echo -e "${YELLOW}   💡 ต้องตั้งค่า Traefik ให้ proxy ไปที่ Nginx (port 8080)${NC}"
        echo -e "${YELLOW}   💡 หรือใช้ Cloudflare Tunnel แทน${NC}"
    else
        echo -e "${YELLOW}⚠️  ไม่พบ Traefik container${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Docker ไม่พบ${NC}"
fi

echo ""
echo -e "${YELLOW}🔍 5. เช็ค DNS...${NC}"
if command -v nslookup &> /dev/null; then
    DNS_RESULT=$(nslookup $DOMAIN 2>&1 | grep -A 2 "Name:" || echo "")
    if [ -n "$DNS_RESULT" ]; then
        echo -e "${GREEN}✅ DNS resolve:${NC}"
        echo "$DNS_RESULT"
    else
        echo -e "${RED}❌ DNS ไม่ resolve${NC}"
        echo -e "${YELLOW}   💡 ตั้งค่า DNS ใน Cloudflare:${NC}"
        echo -e "${YELLOW}      - Type: A${NC}"
        echo -e "${YELLOW}      - Name: $(echo $DOMAIN | cut -d. -f1)${NC}"
        echo -e "${YELLOW}      - Target: [IP ของ VPS]${NC}"
        echo -e "${YELLOW}      - Proxy: ON${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  nslookup ไม่พบ${NC}"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}📝 สรุปและคำแนะนำ:${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# สรุปปัญหา
echo -e "${YELLOW}ปัญหาที่เป็นไปได้:${NC}"
echo ""

# เช็คว่า Nginx listen port 8080 หรือไม่
if command -v nginx &> /dev/null && systemctl is-active --quiet nginx 2>/dev/null; then
    if sudo lsof -i :8080 -sTCP:LISTEN >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Nginx listen port 8080${NC}"
        echo -e "${YELLOW}   💡 ต้องตั้งค่า Traefik ให้ proxy ไปที่ localhost:8080${NC}"
        echo -e "${YELLOW}   💡 หรือใช้ Cloudflare Tunnel แทน (ง่ายกว่า)${NC}"
    else
        echo -e "${RED}❌ Nginx ไม่ listen port 8080${NC}"
        echo -e "${YELLOW}   💡 แก้ไข Nginx config ให้ listen port 8080${NC}"
    fi
fi

# เช็คว่า Caddy listen port 8443 หรือไม่
if command -v caddy &> /dev/null && systemctl is-active --quiet caddy 2>/dev/null; then
    if sudo lsof -i :8443 -sTCP:LISTEN >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Caddy listen port 8443${NC}"
    else
        echo -e "${RED}❌ Caddy ไม่ listen port 8443${NC}"
        echo -e "${YELLOW}   💡 แก้ไข Caddyfile ให้ใช้ :8443${NC}"
    fi
fi

echo ""
echo -e "${YELLOW}💡 วิธีแก้:${NC}"
echo "   1. ใช้ Cloudflare Tunnel (ง่ายที่สุด):"
echo "      ./deploy-auto.sh"
echo ""
echo "   2. ตั้งค่า Traefik ให้ proxy ไปที่ Nginx (port 8080)"
echo "      (ต้องเช็ค Traefik config ของ dev คนอื่น)"
echo ""
echo "   3. แก้ไข Nginx config ให้ listen port 80/443 โดยตรง"
echo "      (ต้อง disable Traefik ก่อน - ไม่แนะนำ)"
echo ""
