#!/bin/bash

# 🔧 Script สำหรับตั้งค่า Nginx/Apache Reverse Proxy ไปที่ Caddy (port 8443)

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}🔧 ตั้งค่า Nginx/Apache Reverse Proxy${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# รับ input
read -p "Domain (เช่น: chh-ticket.ervergreenchh.tech): " DOMAIN
read -p "Caddy port (default: 8443): " CADDY_PORT
CADDY_PORT=${CADDY_PORT:-8443}

echo ""
echo -e "${YELLOW}🔍 เช็ค Web Server...${NC}"

# เช็คว่าใช้ Nginx หรือ Apache
USE_NGINX=false
USE_APACHE=false

# เช็ค Nginx (ใช้ timeout เพื่อป้องกันการค้าง)
if command -v nginx &> /dev/null; then
    # Disable default site ก่อน (ป้องกัน bind port 80 ชนกับ Traefik)
    if [ -L "/etc/nginx/sites-enabled/default" ]; then
        echo -e "${YELLOW}🔧 Disable default site (ป้องกันชนกับ Traefik)...${NC}"
        sudo rm -f /etc/nginx/sites-enabled/default
        echo -e "${GREEN}✅ Disable default site แล้ว${NC}"
    fi
    
    if timeout 5 systemctl is-active --quiet nginx 2>/dev/null; then
        USE_NGINX=true
        echo -e "${GREEN}✅ พบ Nginx (ทำงานอยู่)${NC}"
    else
        echo -e "${YELLOW}⚠️  Nginx ติดตั้งแล้ว แต่ไม่ทำงาน${NC}"
        read -p "ต้องการเริ่ม Nginx หรือไม่? (y/n) [default: y]: " start_nginx
        if [ "${start_nginx:-y}" = "y" ]; then
            echo -e "${YELLOW}🔄 เริ่ม Nginx...${NC}"
            # ทดสอบ config ก่อน start
            if sudo nginx -t 2>&1; then
                timeout 10 sudo systemctl start nginx 2>&1 || {
                    echo -e "${RED}❌ ไม่สามารถเริ่ม Nginx ได้${NC}"
                    echo -e "${YELLOW}💡 ลองเช็ค: sudo systemctl status nginx${NC}"
                    echo -e "${YELLOW}💡 ลองเช็ค logs: sudo journalctl -u nginx -n 50${NC}"
                    exit 1
                }
                timeout 5 sudo systemctl enable nginx 2>&1 || true
                USE_NGINX=true
                echo -e "${GREEN}✅ เริ่ม Nginx แล้ว${NC}"
            else
                echo -e "${RED}❌ Nginx config มีปัญหา - ไม่สามารถ start ได้${NC}"
                echo -e "${YELLOW}💡 ลองเช็ค: sudo nginx -t${NC}"
                exit 1
            fi
        fi
    fi
elif command -v apache2 &> /dev/null; then
    if timeout 5 systemctl is-active --quiet apache2 2>/dev/null; then
        USE_APACHE=true
        echo -e "${GREEN}✅ พบ Apache (ทำงานอยู่)${NC}"
    else
        echo -e "${YELLOW}⚠️  Apache ติดตั้งแล้ว แต่ไม่ทำงาน${NC}"
        read -p "ต้องการเริ่ม Apache หรือไม่? (y/n) [default: y]: " start_apache
        if [ "${start_apache:-y}" = "y" ]; then
            echo -e "${YELLOW}🔄 เริ่ม Apache...${NC}"
            timeout 10 sudo systemctl start apache2 2>&1 || {
                echo -e "${RED}❌ ไม่สามารถเริ่ม Apache ได้${NC}"
                echo -e "${YELLOW}💡 ลองเช็ค: sudo systemctl status apache2${NC}"
                exit 1
            }
            timeout 5 sudo systemctl enable apache2 2>&1 || true
            USE_APACHE=true
            echo -e "${GREEN}✅ เริ่ม Apache แล้ว${NC}"
        fi
    fi
else
    echo -e "${YELLOW}⚠️  ไม่พบ Nginx หรือ Apache ที่ทำงานอยู่${NC}"
    read -p "ต้องการติดตั้ง Nginx หรือไม่? (y/n) [default: y]: " install_nginx
    if [ "${install_nginx:-y}" = "y" ]; then
        echo -e "${YELLOW}📦 ติดตั้ง Nginx...${NC}"
        
        # รอให้ apt lock ปล่อย (ถ้ามี process อื่นใช้ apt อยู่)
        wait_for_apt() {
            local max_wait=60  # รอสูงสุด 60 วินาที
            local waited=0
            
            while [ $waited -lt $max_wait ]; do
                if ! sudo fuser /var/lib/apt/lists/lock /var/lib/dpkg/lock /var/cache/apt/archives/lock >/dev/null 2>&1; then
                    return 0  # apt ว่างแล้ว
                fi
                echo -e "${YELLOW}⏳ รอ apt lock ปล่อย... ($waited/$max_wait วินาที)${NC}"
                sleep 2
                waited=$((waited + 2))
            done
            
            echo -e "${RED}❌ รอ apt lock เกินเวลา - ข้ามการติดตั้ง Nginx${NC}"
            echo -e "${YELLOW}💡 แนะนำ: รอให้ process อื่นเสร็จก่อน แล้วรัน script ใหม่${NC}"
            return 1
        }
        
        if wait_for_apt; then
            # Update และติดตั้ง (ignore warnings เกี่ยวกับ duplicate sources)
            # ใช้ timeout เพื่อป้องกันการค้าง
            timeout 300 sudo apt update 2>&1 | grep -v "configured multiple times" || {
                echo -e "${RED}❌ apt update ล้มเหลวหรือเกินเวลา${NC}"
                exit 1
            }
            timeout 300 sudo apt install nginx -y 2>&1 | grep -v "configured multiple times" || {
                echo -e "${RED}❌ apt install ล้มเหลวหรือเกินเวลา${NC}"
                exit 1
            }
            
            if command -v nginx &> /dev/null; then
                USE_NGINX=true
                echo -e "${GREEN}✅ ติดตั้ง Nginx แล้ว${NC}"
                
                # Disable default site ทันที (ป้องกัน bind port 80 ชนกับ Traefik)
                if [ -L "/etc/nginx/sites-enabled/default" ]; then
                    echo -e "${YELLOW}🔧 Disable default site (ป้องกันชนกับ Traefik)...${NC}"
                    sudo rm -f /etc/nginx/sites-enabled/default
                    echo -e "${GREEN}✅ Disable default site แล้ว${NC}"
                fi
            else
                echo -e "${RED}❌ ติดตั้ง Nginx ไม่สำเร็จ${NC}"
                echo -e "${YELLOW}💡 แนะนำ: ติดตั้งด้วยตนเอง: sudo apt install nginx${NC}"
                exit 1
            fi
        else
            echo -e "${RED}❌ ไม่สามารถติดตั้ง Nginx ได้${NC}"
            exit 1
        fi
    else
        echo -e "${RED}❌ ไม่สามารถดำเนินการต่อได้${NC}"
        exit 1
    fi
fi

if [ "$USE_NGINX" = "true" ]; then
    # ตั้งค่า Nginx
    echo ""
    echo -e "${YELLOW}⚙️  ตั้งค่า Nginx...${NC}"
    
    # Disable default site ที่พยายาม bind port 80 (ชนกับ Traefik)
    if [ -L "/etc/nginx/sites-enabled/default" ]; then
        echo -e "${YELLOW}🔧 Disable default site (ชนกับ Traefik)...${NC}"
        sudo rm -f /etc/nginx/sites-enabled/default
        echo -e "${GREEN}✅ Disable default site แล้ว${NC}"
    fi
    
    SITE_NAME=$(echo "$DOMAIN" | cut -d. -f1)
    NGINX_CONFIG="/etc/nginx/sites-available/$SITE_NAME"
    
    # เช็คว่า port 80/443 ถูกใช้หรือไม่
    PORT_80_IN_USE=false
    PORT_443_IN_USE=false
    
    if command -v lsof &> /dev/null; then
        if sudo lsof -i :80 -sTCP:LISTEN >/dev/null 2>&1; then
            PORT_80_IN_USE=true
        fi
        if sudo lsof -i :443 -sTCP:LISTEN >/dev/null 2>&1; then
            PORT_443_IN_USE=true
        fi
    fi
    
    # สร้าง config
    if [ "$PORT_80_IN_USE" = "true" ] || [ "$PORT_443_IN_USE" = "true" ]; then
        # ถ้า port 80/443 ถูกใช้ (Traefik) → ให้ Nginx listen port อื่น (8080)
        # แล้วให้ Traefik proxy ไปที่ Nginx (port 8080)
        # Nginx จะ proxy ไปที่ Caddy (port $CADDY_PORT)
        echo -e "${YELLOW}⚠️  Port 80/443 ถูกใช้โดย Traefik${NC}"
        echo -e "${YELLOW}💡 ใช้ Nginx เป็น reverse proxy ไปที่ Caddy (port $CADDY_PORT)${NC}"
        echo -e "${YELLOW}💡 Nginx จะ listen port 8080${NC}"
        
        sudo tee "$NGINX_CONFIG" > /dev/null << EOF
# Nginx Reverse Proxy สำหรับ $DOMAIN
# Traefik จะ proxy ไปที่ Nginx (port 8080)
# Nginx จะ proxy ไปที่ Caddy (port $CADDY_PORT)

server {
    listen 8080;
    server_name $DOMAIN;

    location / {
        proxy_pass http://localhost:$CADDY_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
        echo -e "${YELLOW}💡 ต้องตั้งค่า Traefik ให้ proxy ไปที่ localhost:8080${NC}"
        echo -e "${YELLOW}💡 หรือใช้ Cloudflare Tunnel แทน (ไม่ต้องใช้ Nginx)${NC}"
    else
        # ถ้า port 80/443 ว่าง → ใช้ HTTP redirect ไปที่ Caddy (ไม่ใช้ SSL ที่ Nginx)
        # เพราะ Caddy จัดการ SSL อยู่แล้ว
        sudo tee "$NGINX_CONFIG" > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    # Redirect HTTP → Caddy (Caddy จะจัดการ HTTPS)
    location / {
        proxy_pass http://localhost:$CADDY_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}

server {
    listen 443;
    server_name $DOMAIN;
    
    # Proxy HTTPS → Caddy (Caddy จัดการ SSL อยู่แล้ว)
    location / {
        proxy_pass http://localhost:$CADDY_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
    fi
    
    echo -e "${GREEN}✅ สร้าง Nginx config แล้ว${NC}"
    
    # Enable site
    if [ ! -L "/etc/nginx/sites-enabled/$SITE_NAME" ]; then
        sudo ln -s "$NGINX_CONFIG" "/etc/nginx/sites-enabled/$SITE_NAME"
        echo -e "${GREEN}✅ Enable site แล้ว${NC}"
    fi
    
    # ทดสอบ config
    echo -e "${YELLOW}🔍 ทดสอบ Nginx config...${NC}"
    if sudo nginx -t; then
        echo -e "${GREEN}✅ Nginx config ถูกต้อง${NC}"
        
        # เช็คว่า Nginx ทำงานอยู่หรือไม่
        if timeout 5 systemctl is-active --quiet nginx 2>/dev/null; then
            # Reload Nginx (ใช้ timeout เพื่อป้องกันการค้าง)
            echo -e "${YELLOW}🔄 Reload Nginx...${NC}"
            timeout 10 sudo systemctl reload nginx 2>&1 || {
                echo -e "${RED}❌ Nginx reload ล้มเหลวหรือเกินเวลา${NC}"
                echo -e "${YELLOW}💡 ลองเช็ค: sudo systemctl status nginx${NC}"
                echo -e "${YELLOW}💡 ลองเช็ค logs: sudo journalctl -u nginx -n 50${NC}"
                exit 1
            }
            echo -e "${GREEN}✅ Reload Nginx แล้ว${NC}"
        else
            # Start Nginx (ใช้ timeout เพื่อป้องกันการค้าง)
            echo -e "${YELLOW}🔄 Start Nginx...${NC}"
            timeout 10 sudo systemctl start nginx 2>&1 || {
                echo -e "${RED}❌ Nginx start ล้มเหลวหรือเกินเวลา${NC}"
                echo -e "${YELLOW}💡 ลองเช็ค: sudo systemctl status nginx${NC}"
                echo -e "${YELLOW}💡 ลองเช็ค logs: sudo journalctl -u nginx -n 50${NC}"
                echo -e "${YELLOW}💡 ถ้ายังมีปัญหา: sudo nginx -t${NC}"
                exit 1
            }
            timeout 5 sudo systemctl enable nginx 2>&1 || true
            echo -e "${GREEN}✅ Start Nginx แล้ว${NC}"
        fi
    else
        echo -e "${RED}❌ Nginx config มีปัญหา${NC}"
        echo -e "${YELLOW}💡 ลองเช็ค: sudo nginx -t${NC}"
        exit 1
    fi
    
elif [ "$USE_APACHE" = "true" ]; then
    # ตั้งค่า Apache
    echo ""
    echo -e "${YELLOW}⚙️  ตั้งค่า Apache...${NC}"
    
    SITE_NAME=$(echo "$DOMAIN" | cut -d. -f1)
    APACHE_CONFIG="/etc/apache2/sites-available/$SITE_NAME.conf"
    
    # สร้าง config
    sudo tee "$APACHE_CONFIG" > /dev/null << EOF
<VirtualHost *:80>
    ServerName $DOMAIN
    Redirect permanent / https://$DOMAIN/
</VirtualHost>

<VirtualHost *:443>
    ServerName $DOMAIN
    
    # SSL certificates (ถ้ามี)
    # SSLEngine on
    # SSLCertificateFile /etc/letsencrypt/live/$DOMAIN/fullchain.pem
    # SSLCertificateKeyFile /etc/letsencrypt/live/$DOMAIN/privkey.pem

    ProxyPreserveHost On
    ProxyPass / http://localhost:$CADDY_PORT/
    ProxyPassReverse / http://localhost:$CADDY_PORT/
</VirtualHost>
EOF
    
    echo -e "${GREEN}✅ สร้าง Apache config แล้ว${NC}"
    
    # Enable modules
    sudo a2enmod proxy proxy_http ssl rewrite
    
    # Enable site
    sudo a2ensite "$SITE_NAME.conf"
    
    # ทดสอบ config
    echo -e "${YELLOW}🔍 ทดสอบ Apache config...${NC}"
    if sudo apache2ctl configtest; then
        echo -e "${GREEN}✅ Apache config ถูกต้อง${NC}"
        
        # Reload Apache (ใช้ timeout เพื่อป้องกันการค้าง)
        echo -e "${YELLOW}🔄 Reload Apache...${NC}"
        timeout 10 sudo systemctl reload apache2 2>&1 || {
            echo -e "${RED}❌ Apache reload ล้มเหลวหรือเกินเวลา${NC}"
            echo -e "${YELLOW}💡 ลองเช็ค: sudo systemctl status apache2${NC}"
            echo -e "${YELLOW}💡 ลองเช็ค logs: sudo journalctl -u apache2 -n 50${NC}"
            exit 1
        }
        echo -e "${GREEN}✅ Reload Apache แล้ว${NC}"
    else
        echo -e "${RED}❌ Apache config มีปัญหา${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}🎉 ตั้งค่าเสร็จสิ้น!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
echo "📊 ข้อมูล:"
echo "   - Domain: $DOMAIN"
echo "   - Caddy port: $CADDY_PORT"
echo "   - Web Server: $([ "$USE_NGINX" = "true" ] && echo "Nginx" || echo "Apache")"
echo ""
echo "📝 คำสั่งที่มีประโยชน์:"
if [ "$USE_NGINX" = "true" ]; then
    echo "   - Nginx status: sudo systemctl status nginx"
    echo "   - Nginx logs: sudo tail -f /var/log/nginx/error.log"
    echo "   - Test config: sudo nginx -t"
    echo "   - Reload: sudo systemctl reload nginx"
else
    echo "   - Apache status: sudo systemctl status apache2"
    echo "   - Apache logs: sudo tail -f /var/log/apache2/error.log"
    echo "   - Test config: sudo apache2ctl configtest"
    echo "   - Reload: sudo systemctl reload apache2"
fi
echo ""
echo "🌐 ตั้งค่า DNS ใน Cloudflare:"
echo "   1. ไปที่ Cloudflare Dashboard"
echo "   2. DNS > Records"
echo "   3. Add record:"
echo "      - Type: A"
echo "      - Name: $(echo $DOMAIN | cut -d. -f1)"
echo "      - Target: [IP ของ VPS]"
echo "      - Proxy: ON (สีส้ม) ✅"
echo ""
echo -e "${YELLOW}💡 หมายเหตุ:${NC}"
echo "   - ถ้าต้องการ SSL ให้ติดตั้ง Let's Encrypt:"
echo "     sudo apt install certbot python3-certbot-nginx"
echo "     sudo certbot --nginx -d $DOMAIN"
echo ""
