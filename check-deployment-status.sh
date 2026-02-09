#!/bin/bash

# 🔍 Script สำหรับเช็คว่า Dev คนอื่น Deploy ผ่านอะไร

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}🔍 เช็คสถานะ Web Servers และ Services${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# 1. เช็ค Web Servers
echo -e "${YELLOW}📦 Web Servers:${NC}"
echo ""

# Nginx
if command -v nginx &> /dev/null; then
    if systemctl is-active --quiet nginx 2>/dev/null; then
        echo -e "${GREEN}✅ Nginx: ทำงานอยู่${NC}"
        echo "   - Status: $(systemctl is-active nginx 2>/dev/null || echo 'unknown')"
        echo "   - Config: /etc/nginx/nginx.conf"
        echo "   - Sites: /etc/nginx/sites-enabled/"
    else
        echo -e "${YELLOW}⚠️  Nginx: ติดตั้งแล้ว แต่ไม่ทำงาน${NC}"
    fi
else
    echo -e "${RED}❌ Nginx: ไม่พบ${NC}"
fi

echo ""

# Apache
if command -v apache2 &> /dev/null; then
    if systemctl is-active --quiet apache2 2>/dev/null; then
        echo -e "${GREEN}✅ Apache: ทำงานอยู่${NC}"
        echo "   - Status: $(systemctl is-active apache2 2>/dev/null || echo 'unknown')"
        echo "   - Config: /etc/apache2/apache2.conf"
        echo "   - Sites: /etc/apache2/sites-enabled/"
    else
        echo -e "${YELLOW}⚠️  Apache: ติดตั้งแล้ว แต่ไม่ทำงาน${NC}"
    fi
else
    echo -e "${RED}❌ Apache: ไม่พบ${NC}"
fi

echo ""

# Caddy
if command -v caddy &> /dev/null; then
    if systemctl is-active --quiet caddy 2>/dev/null; then
        echo -e "${GREEN}✅ Caddy: ทำงานอยู่${NC}"
        echo "   - Status: $(systemctl is-active caddy 2>/dev/null || echo 'unknown')"
        echo "   - Config: /etc/caddy/Caddyfile"
    else
        echo -e "${YELLOW}⚠️  Caddy: ติดตั้งแล้ว แต่ไม่ทำงาน${NC}"
    fi
else
    echo -e "${RED}❌ Caddy: ไม่พบ${NC}"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}🌐 Port Usage:${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# 2. เช็ค Port 80
echo -e "${YELLOW}Port 80 (HTTP):${NC}"
if command -v lsof &> /dev/null; then
    PORT_80_PROCESS=$(sudo lsof -i :80 -sTCP:LISTEN 2>/dev/null | tail -n +2)
    if [ -n "$PORT_80_PROCESS" ]; then
        echo "$PORT_80_PROCESS" | while read line; do
            PID=$(echo "$line" | awk '{print $2}')
            CMD=$(echo "$line" | awk '{print $1}')
            USER=$(echo "$line" | awk '{print $3}')
            echo -e "   ${GREEN}✅ ถูกใช้โดย:${NC}"
            echo "      - Process: $CMD (PID: $PID, User: $USER)"
            echo "      - Command: $(ps -p $PID -o cmd= 2>/dev/null || echo 'N/A')"
        done
    else
        echo -e "   ${GREEN}✅ ว่าง${NC}"
    fi
else
    echo -e "   ${YELLOW}⚠️  ไม่สามารถเช็คได้ (ไม่มี lsof)${NC}"
fi

echo ""

# 3. เช็ค Port 443
echo -e "${YELLOW}Port 443 (HTTPS):${NC}"
if command -v lsof &> /dev/null; then
    PORT_443_PROCESS=$(sudo lsof -i :443 -sTCP:LISTEN 2>/dev/null | tail -n +2)
    if [ -n "$PORT_443_PROCESS" ]; then
        echo "$PORT_443_PROCESS" | while read line; do
            PID=$(echo "$line" | awk '{print $2}')
            CMD=$(echo "$line" | awk '{print $1}')
            USER=$(echo "$line" | awk '{print $3}')
            echo -e "   ${GREEN}✅ ถูกใช้โดย:${NC}"
            echo "      - Process: $CMD (PID: $PID, User: $USER)"
            echo "      - Command: $(ps -p $PID -o cmd= 2>/dev/null || echo 'N/A')"
        done
    else
        echo -e "   ${GREEN}✅ ว่าง${NC}"
    fi
else
    echo -e "   ${YELLOW}⚠️  ไม่สามารถเช็คได้ (ไม่มี lsof)${NC}"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}🐳 Docker Containers:${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# 4. เช็ค Docker
if command -v docker &> /dev/null; then
    DOCKER_CONTAINERS=$(sudo docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null)
    if [ -n "$DOCKER_CONTAINERS" ]; then
        echo "$DOCKER_CONTAINERS"
        echo ""
        echo -e "${YELLOW}Containers ที่ใช้ port 80/443:${NC}"
        sudo docker ps --format "{{.Names}}: {{.Ports}}" 2>/dev/null | grep -E "80|443" || echo "   ไม่พบ"
    else
        echo -e "${GREEN}✅ ไม่มี containers ที่ทำงานอยู่${NC}"
    fi
else
    echo -e "${RED}❌ Docker: ไม่พบ${NC}"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}📋 Nginx Sites:${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# 5. เช็ค Nginx Sites
if [ -d "/etc/nginx/sites-enabled" ]; then
    NGINX_SITES=$(ls -1 /etc/nginx/sites-enabled/ 2>/dev/null)
    if [ -n "$NGINX_SITES" ]; then
        echo "$NGINX_SITES" | while read site; do
            echo -e "${GREEN}✅ $site${NC}"
            if [ -f "/etc/nginx/sites-enabled/$site" ]; then
                echo "   - Server names: $(grep -E "server_name" /etc/nginx/sites-enabled/$site 2>/dev/null | grep -v "#" | head -1 | sed 's/server_name//' | sed 's/;//' | xargs || echo 'N/A')"
                echo "   - Listen ports: $(grep -E "listen" /etc/nginx/sites-enabled/$site 2>/dev/null | grep -v "#" | head -1 | sed 's/listen//' | sed 's/;//' | xargs || echo 'N/A')"
            fi
        done
    else
        echo -e "${YELLOW}⚠️  ไม่มี sites ที่ enable${NC}"
    fi
else
    echo -e "${RED}❌ Nginx sites-enabled directory ไม่พบ${NC}"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}📋 Apache Sites:${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# 6. เช็ค Apache Sites
if [ -d "/etc/apache2/sites-enabled" ]; then
    APACHE_SITES=$(ls -1 /etc/apache2/sites-enabled/ 2>/dev/null)
    if [ -n "$APACHE_SITES" ]; then
        echo "$APACHE_SITES" | while read site; do
            echo -e "${GREEN}✅ $site${NC}"
            if [ -f "/etc/apache2/sites-enabled/$site" ]; then
                echo "   - Server names: $(grep -E "ServerName" /etc/apache2/sites-enabled/$site 2>/dev/null | grep -v "#" | head -1 | sed 's/ServerName//' | xargs || echo 'N/A')"
                echo "   - VirtualHost ports: $(grep -E "<VirtualHost" /etc/apache2/sites-enabled/$site 2>/dev/null | grep -v "#" | head -1 | sed 's/<VirtualHost//' | sed 's/>//' | xargs || echo 'N/A')"
            fi
        done
    else
        echo -e "${YELLOW}⚠️  ไม่มี sites ที่ enable${NC}"
    fi
else
    echo -e "${RED}❌ Apache sites-enabled directory ไม่พบ${NC}"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}📋 Caddy Config:${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# 7. เช็ค Caddy Config
if [ -f "/etc/caddy/Caddyfile" ]; then
    echo -e "${GREEN}✅ พบ Caddyfile${NC}"
    echo ""
    echo -e "${YELLOW}Domains/Ports ที่ configure:${NC}"
    grep -E "^[a-zA-Z0-9.-]+|^:[0-9]+" /etc/caddy/Caddyfile 2>/dev/null | grep -v "^#" | grep -v "^$" | head -10 || echo "   ไม่พบ"
else
    echo -e "${RED}❌ Caddyfile ไม่พบ${NC}"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}📊 PM2 Processes:${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# 8. เช็ค PM2
if command -v pm2 &> /dev/null; then
    PM2_LIST=$(pm2 list 2>/dev/null)
    if [ -n "$PM2_LIST" ]; then
        echo "$PM2_LIST"
        echo ""
        echo -e "${YELLOW}PM2 Apps ที่ใช้ port:${NC}"
        pm2 jlist 2>/dev/null | grep -E "name|PORT" | head -20 || echo "   ไม่พบ"
    else
        echo -e "${GREEN}✅ ไม่มี PM2 processes${NC}"
    fi
else
    echo -e "${RED}❌ PM2: ไม่พบ${NC}"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}📝 สรุป:${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# สรุป
echo -e "${YELLOW}Web Servers ที่ทำงาน:${NC}"
if systemctl is-active --quiet nginx 2>/dev/null; then
    echo -e "   ${GREEN}✅ Nginx${NC}"
fi
if systemctl is-active --quiet apache2 2>/dev/null; then
    echo -e "   ${GREEN}✅ Apache${NC}"
fi
if systemctl is-active --quiet caddy 2>/dev/null; then
    echo -e "   ${GREEN}✅ Caddy${NC}"
fi

echo ""
echo -e "${YELLOW}Port Status:${NC}"
if sudo lsof -i :80 -sTCP:LISTEN >/dev/null 2>&1; then
    PORT_80_CMD=$(sudo lsof -i :80 -sTCP:LISTEN 2>/dev/null | tail -1 | awk '{print $1}')
    echo -e "   Port 80: ${RED}ถูกใช้โดย $PORT_80_CMD${NC}"
else
    echo -e "   Port 80: ${GREEN}ว่าง${NC}"
fi

if sudo lsof -i :443 -sTCP:LISTEN >/dev/null 2>&1; then
    PORT_443_CMD=$(sudo lsof -i :443 -sTCP:LISTEN 2>/dev/null | tail -1 | awk '{print $1}')
    echo -e "   Port 443: ${RED}ถูกใช้โดย $PORT_443_CMD${NC}"
else
    echo -e "   Port 443: ${GREEN}ว่าง${NC}"
fi

echo ""
echo -e "${YELLOW}💡 คำแนะนำ:${NC}"
echo "   - ถ้า port 80/443 ถูกใช้ → ใช้ Caddy + Nginx/Apache Reverse Proxy"
echo "   - หรือใช้ Cloudflare Tunnel (ไม่ต้องใช้ port 80/443)"
echo ""
