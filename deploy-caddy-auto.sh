#!/bin/bash

# 🚀 Auto Deploy Script สำหรับ Next.js/Vite + Caddy + Cloudflare Proxy
# ทำทุกอย่างให้อัตโนมัติ - ไม่กระทบเว็บอื่น - รองรับหลายโปรเจค

set -e  # หยุดถ้ามี error

echo "🚀 เริ่ม Auto Deploy ด้วย Caddy..."

# สีสำหรับ output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Domain ของคุณ
DOMAIN="ervergreenchh.tech"

# รับ input ชื่อโปรเจค
echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}📝 ตั้งค่าข้อมูลโปรเจค${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

read -p "ชื่อโปรเจค (เช่น: chh-ticket, production, app): " PROJECT_NAME
PROJECT_NAME=${PROJECT_NAME:-chh-ticket}  # Default: chh-ticket

read -p "Subdomain (เช่น: ticket, prod, app) [default: $PROJECT_NAME]: " SUBDOMAIN
SUBDOMAIN=${SUBDOMAIN:-$PROJECT_NAME}  # Default: ชื่อโปรเจค

FULL_DOMAIN="${SUBDOMAIN}.${DOMAIN}"

echo ""
echo -e "${GREEN}✅ ตั้งค่า:${NC}"
echo "   - ชื่อโปรเจค: $PROJECT_NAME"
echo "   - Subdomain: $SUBDOMAIN"
echo "   - Domain: $FULL_DOMAIN"
echo ""

# 1. เช็คว่ามี Node.js และ PM2 หรือยัง
echo -e "${YELLOW}📦 เช็ค Dependencies...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ ไม่พบ Node.js - กรุณาติดตั้ง Node.js ก่อน${NC}"
    exit 1
fi

if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}⚠️  ไม่พบ PM2 - กำลังติดตั้ง...${NC}"
    npm install -g pm2
fi

# 2. หา port ว่างอัตโนมัติ (ไม่จำกัดจำนวนโปรเจค)
echo -e "${YELLOW}🔍 หา port ว่าง...${NC}"

find_free_port() {
    # เริ่มจาก port 3000 แล้วหาไปเรื่อยๆ จนเจอ
    for port in {3000..9999}; do
        # เช็คว่า port ไม่ถูกใช้
        if ! lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            # เช็คว่า port นี้ยังไม่ถูกใช้ใน PM2
            PORT_IN_USE=false
            if command -v pm2 &> /dev/null; then
                # เช็คจาก PM2 ecosystem files
                for pm2_file in ~/apps/*/ecosystem.config.*; do
                    if [ -f "$pm2_file" ]; then
                        if grep -q "PORT.*$port" "$pm2_file" 2>/dev/null; then
                            PORT_IN_USE=true
                            break
                        fi
                    fi
                done
                
                # เช็คจาก PM2 process env
                if pm2 jlist 2>/dev/null | grep -q "\"PORT\":$port"; then
                    PORT_IN_USE=true
                fi
            fi
            
            # ถ้า port ว่างจริงๆ
            if [ "$PORT_IN_USE" = "false" ]; then
                echo $port
                return
            fi
        fi
    done
    
    # ถ้าไม่เจอเลย (ไม่น่าจะเกิด) ให้ใช้ random port
    echo $((3000 + RANDOM % 7000))
}

FREE_PORT=$(find_free_port)
echo -e "${GREEN}✅ พบ port ว่าง: $FREE_PORT${NC}"

# 3. สร้างโฟลเดอร์สำหรับโปรเจค
APP_DIR="$HOME/apps/$PROJECT_NAME"
echo -e "${YELLOW}📁 สร้างโฟลเดอร์: $APP_DIR${NC}"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# 4. ถ้ายังไม่มีโปรเจค ให้ถามว่าจะ clone หรือ upload
if [ ! -f "package.json" ]; then
    echo -e "${YELLOW}⚠️  ไม่พบโปรเจคใน $APP_DIR${NC}"
    echo "เลือกวิธี:"
    echo "1) Clone จาก Git"
    echo "2) Upload ไฟล์เอง (กด Enter เพื่อข้าม)"
    read -p "เลือก (1/2): " choice
    
    if [ "$choice" = "1" ]; then
        read -p "Git URL: " git_url
        git clone "$git_url" .
    else
        echo "กรุณา upload ไฟล์ไปที่ $APP_DIR แล้วรัน script ใหม่"
        exit 1
    fi
fi

# 5. ติดตั้ง dependencies
echo -e "${YELLOW}📦 ติดตั้ง Dependencies...${NC}"
npm install

# 5.1 ตรวจสอบประเภทโปรเจค (Next.js หรือ Vite)
echo -e "${YELLOW}🔍 ตรวจสอบประเภทโปรเจค...${NC}"

if grep -q '"next"' package.json 2>/dev/null; then
    PROJECT_TYPE="nextjs"
    START_CMD="start"
    echo -e "${GREEN}✅ ตรวจพบ: Next.js${NC}"
elif grep -q '"vite"' package.json 2>/dev/null; then
    PROJECT_TYPE="vite"
    if grep -q '"preview"' package.json; then
        START_CMD="run preview"
    else
        START_CMD="run preview"
        echo -e "${YELLOW}⚠️  ไม่พบ preview script - จะใช้ 'npm run preview'${NC}"
    fi
    echo -e "${GREEN}✅ ตรวจพบ: Vite${NC}"
else
    echo -e "${YELLOW}⚠️  ไม่สามารถระบุประเภทโปรเจคได้${NC}"
    echo "เลือกประเภท:"
    echo "1) Next.js (ใช้ 'npm start')"
    echo "2) Vite (ใช้ 'npm run preview')"
    echo "3) อื่นๆ (ระบุคำสั่งเอง)"
    read -p "เลือก (1/2/3) [default: 1]: " project_choice
    
    case "${project_choice:-1}" in
        1)
            PROJECT_TYPE="nextjs"
            START_CMD="start"
            ;;
        2)
            PROJECT_TYPE="vite"
            START_CMD="run preview"
            ;;
        3)
            read -p "คำสั่ง start (เช่น: 'start', 'run dev', 'run preview'): " custom_cmd
            START_CMD="$custom_cmd"
            PROJECT_TYPE="custom"
            ;;
        *)
            PROJECT_TYPE="nextjs"
            START_CMD="start"
            ;;
    esac
    echo -e "${GREEN}✅ ตั้งค่า: $PROJECT_TYPE (คำสั่ง: npm $START_CMD)${NC}"
fi

# 6. สร้างไฟล์ Environment Variables
echo -e "${YELLOW}⚙️  สร้างไฟล์ Environment Variables...${NC}"

# ตั้งชื่อไฟล์ env ตามประเภทโปรเจค
if [ "$PROJECT_TYPE" = "vite" ]; then
    ENV_FILE=".env.production"
    ENV_PREFIX="VITE_"
else
    ENV_FILE=".env.production"
    ENV_PREFIX="NEXT_PUBLIC_"
fi

if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" << EOF
# Supabase Configuration
${ENV_PREFIX}SUPABASE_URL=https://rvaywihlohlhyrowwixz.supabase.co
${ENV_PREFIX}SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2YXl3aWhsb2hsaHlyb3d3aXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyNzgzOTQsImV4cCI6MjA2OTg1NDM5NH0.arW_SbAltWfv-AKIY5VcN9SBYxnKpA_UU2YzClpcqgQ

# Service Role Key (สำหรับ server-side)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2YXl3aWhsb2hsaHlyb3d3aXh6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDI3ODM5NCwiZXhwIjoyMDY5ODU0Mzk0fQ.c3NEgyuHO9SDPsRx5baxWGBGxQxBGbCAIyt8-01LVN8

# Port (ตั้งอัตโนมัติ)
PORT=$FREE_PORT
NODE_ENV=production
EOF
    echo -e "${GREEN}✅ สร้างไฟล์ $ENV_FILE แล้ว${NC}"
else
    # อัพเดท PORT ในไฟล์ที่มีอยู่
    if grep -q "PORT=" "$ENV_FILE"; then
        sed -i "s/PORT=.*/PORT=$FREE_PORT/" "$ENV_FILE"
    else
        echo "PORT=$FREE_PORT" >> "$ENV_FILE"
    fi
    echo -e "${GREEN}✅ อัพเดท PORT ใน $ENV_FILE แล้ว${NC}"
fi

# สำหรับ Vite ต้องตั้งค่า port ใน vite.config.js หรือ .env
if [ "$PROJECT_TYPE" = "vite" ]; then
    if ! grep -q "VITE_PORT" "$ENV_FILE"; then
        echo "VITE_PORT=$FREE_PORT" >> "$ENV_FILE"
    fi
fi

# 7. Build โปรเจค
echo -e "${YELLOW}🔨 Build โปรเจค...${NC}"
npm run build

# 8. สร้างไฟล์ PM2 Config
echo -e "${YELLOW}⚙️  สร้างไฟล์ PM2 Config...${NC}"

# เช็คว่า package.json มี "type": "module" หรือไม่
HAS_ESM=false
if [ -f "package.json" ] && grep -q '"type".*"module"' package.json; then
    HAS_ESM=true
    PM2_CONFIG_FILE="ecosystem.config.cjs"
else
    PM2_CONFIG_FILE="ecosystem.config.js"
fi

# สร้าง PM2 config ตามประเภทโปรเจค
if [ "$PROJECT_TYPE" = "vite" ]; then
    PM2_SCRIPT="npm"
    PM2_ARGS="run preview -- --port $FREE_PORT --host"
else
    PM2_SCRIPT="npm"
    PM2_ARGS="$START_CMD"
fi

cat > "$PM2_CONFIG_FILE" << EOF
module.exports = {
  apps: [
    {
      name: '$PROJECT_NAME',
      script: '$PM2_SCRIPT',
      args: '$PM2_ARGS',
      cwd: '$APP_DIR',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: $FREE_PORT,
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: '$HOME/.pm2/logs/$PROJECT_NAME-error.log',
      out_file: '$HOME/.pm2/logs/$PROJECT_NAME-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
EOF

echo -e "${GREEN}✅ สร้างไฟล์ $PM2_CONFIG_FILE แล้ว${NC}"

# 9. Start/Restart PM2
echo -e "${YELLOW}🚀 เริ่ม App ด้วย PM2...${NC}"

if pm2 list | grep -q "$PROJECT_NAME"; then
    pm2 restart "$PROJECT_NAME"
    echo -e "${GREEN}✅ Restart App แล้ว${NC}"
else
    pm2 start "$PM2_CONFIG_FILE"
    pm2 save
    echo -e "${GREEN}✅ Start App แล้ว${NC}"
fi

# 10. ตั้งค่า PM2 startup
echo -e "${YELLOW}⚙️  ตั้งค่า PM2 Startup...${NC}"
pm2 startup > /tmp/pm2_startup.txt 2>&1 || true
pm2 save

# 11. ทดสอบว่า app ทำงาน
echo -e "${YELLOW}🧪 ทดสอบ App...${NC}"
sleep 3

if curl -s http://localhost:$FREE_PORT > /dev/null; then
    echo -e "${GREEN}✅ App ทำงานที่ port $FREE_PORT!${NC}"
else
    echo -e "${RED}⚠️  App อาจยังไม่พร้อม - รอสักครู่แล้วลองใหม่${NC}"
fi

# 12. ติดตั้ง Caddy (ถ้ายังไม่มี)
echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}☁️  ตั้งค่า Caddy${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

if ! command -v caddy &> /dev/null; then
    echo -e "${YELLOW}⚠️  ไม่พบ Caddy - กำลังติดตั้ง...${NC}"
    
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
        
        echo -e "${RED}❌ รอ apt lock เกินเวลา - ข้ามการติดตั้ง Caddy${NC}"
        echo -e "${YELLOW}💡 แนะนำ: รอให้ process อื่นเสร็จก่อน แล้วรัน script ใหม่${NC}"
        return 1
    }
    
    if wait_for_apt; then
        # เช็คว่ามี caddy-stable.list อยู่แล้วหรือยัง (ป้องกัน duplicate)
        if [ ! -f "/etc/apt/sources.list.d/caddy-stable.list" ]; then
            echo -e "${YELLOW}📥 ตั้งค่า Caddy repository...${NC}"
            sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https 2>/dev/null || true
            curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null || true
            curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null 2>&1 || true
        else
            echo -e "${GREEN}✅ พบ Caddy repository แล้ว${NC}"
        fi
        
        # Update และติดตั้ง (ignore warnings เกี่ยวกับ duplicate sources)
        echo -e "${YELLOW}📦 ติดตั้ง Caddy...${NC}"
        sudo apt update 2>&1 | grep -v "configured multiple times" || true
        sudo apt install -y caddy 2>&1 | grep -v "configured multiple times" || true
        
        if command -v caddy &> /dev/null; then
            echo -e "${GREEN}✅ ติดตั้ง Caddy แล้ว${NC}"
        else
            echo -e "${RED}❌ ติดตั้ง Caddy ไม่สำเร็จ${NC}"
            echo -e "${YELLOW}💡 แนะนำ: ติดตั้งด้วยตนเอง: sudo apt install caddy${NC}"
            SKIP_CADDY_INSTALL=true
        fi
    else
        SKIP_CADDY_INSTALL=true
    fi
else
    echo -e "${GREEN}✅ พบ Caddy แล้ว${NC}"
fi

    # 13. สร้าง Caddy Config (เพิ่มใหม่ ไม่ลบของเดิม)
    if [ "$SKIP_CADDY_INSTALL" != "true" ] && [ "$SKIP_CADDY_CONFIG" != "true" ]; then
    echo -e "${YELLOW}⚙️  สร้างไฟล์ Caddy config...${NC}"
    
    CADDYFILE="/etc/caddy/Caddyfile"
    
    # เช็คว่ามี config สำหรับ domain นี้อยู่แล้วหรือยัง (เฉพาะเมื่อไม่ใช้ Nginx proxy)
    if [ "$USE_NGINX_PROXY" != "true" ]; then
        if grep -q "$FULL_DOMAIN" "$CADDYFILE" 2>/dev/null; then
            echo -e "${YELLOW}⚠️  พบ config สำหรับ $FULL_DOMAIN อยู่แล้ว${NC}"
            read -p "ต้องการอัพเดท config ใหม่หรือไม่? (y/n) [default: y]: " update_choice
            if [ "${update_choice:-y}" = "y" ]; then
                # ลบ config เก่า
                sudo sed -i "/^$FULL_DOMAIN {/,/^}$/d" "$CADDYFILE"
                echo -e "${GREEN}✅ ลบ config เก่าแล้ว${NC}"
            else
                echo -e "${YELLOW}⚠️  ข้ามการอัพเดท config${NC}"
                SKIP_CADDY=true
            fi
        fi
    fi
    
    if [ "$SKIP_CADDY" != "true" ]; then
    # เพิ่ม config ใหม่
    if [ "$USE_NGINX_PROXY" = "true" ]; then
        # ใช้ Caddy bind port อื่น (8443) สำหรับ Nginx/Apache reverse proxy
        # ลบ config เก่าที่ bind port 80/443 (ถ้ามี)
        echo -e "${YELLOW}🧹 ลบ config เก่าที่ bind port 80/443...${NC}"
        
        # Backup Caddyfile
        echo -e "${YELLOW}📦 Backup Caddyfile...${NC}"
        sudo cp "$CADDYFILE" "${CADDYFILE}.backup.$(date +%Y%m%d_%H%M%S)" 2>&1 || echo -e "${YELLOW}⚠️  Backup ไม่สำเร็จ (ข้าม)${NC}"
        
        # ลบ config ที่ bind port 80/443
        echo -e "${YELLOW}🗑️  ลบ config port 80/443...${NC}"
        sudo sed -i '/^:80 {/,/^}$/d' "$CADDYFILE" 2>&1 || echo -e "${YELLOW}⚠️  ลบ :80 ไม่สำเร็จ (ข้าม)${NC}"
        sudo sed -i '/^:443 {/,/^}$/d' "$CADDYFILE" 2>&1 || echo -e "${YELLOW}⚠️  ลบ :443 ไม่สำเร็จ (ข้าม)${NC}"
        
        # ลบ config domain ที่จะ bind port 443 (ถ้ามี)
        if grep -q "^$FULL_DOMAIN {" "$CADDYFILE" 2>/dev/null; then
            echo -e "${YELLOW}🗑️  ลบ config domain $FULL_DOMAIN...${NC}"
            sudo sed -i "/^$FULL_DOMAIN {/,/^}$/d" "$CADDYFILE" 2>&1 || echo -e "${YELLOW}⚠️  ลบ domain config ไม่สำเร็จ (ข้าม)${NC}"
        fi
        
        # เพิ่ม config ใหม่ (port 8443)
        echo -e "${YELLOW}➕ เพิ่ม config ใหม่ (port $CADDY_PORT)...${NC}"
        sudo tee -a "$CADDYFILE" << EOF

# Config for $PROJECT_NAME (via Nginx/Apache proxy)
:$CADDY_PORT {
    reverse_proxy localhost:$FREE_PORT
}
EOF
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ เพิ่ม config ใน Caddyfile (port $CADDY_PORT) แล้ว${NC}"
        else
            echo -e "${RED}❌ เพิ่ม config ไม่สำเร็จ${NC}"
        fi
        echo -e "${YELLOW}💡 ต่อไป: ตั้งค่า Nginx/Apache เป็น reverse proxy ไปที่ localhost:$CADDY_PORT${NC}"
        echo -e "${YELLOW}   ดูคู่มือ: ALTERNATIVES_NO_CLOUDFLARE.md${NC}"
    else
        # ใช้ Caddy bind port 443 ปกติ
        sudo tee -a "$CADDYFILE" << EOF

# Config for $PROJECT_NAME
$FULL_DOMAIN {
    reverse_proxy localhost:$FREE_PORT
}
EOF
        echo -e "${GREEN}✅ เพิ่ม config ใน Caddyfile แล้ว${NC}"
    fi
    
    # 14. เปิด Port ใน Firewall (ถ้าไม่ใช้ Nginx proxy mode)
    if [ "$USE_NGINX_PROXY" != "true" ]; then
        echo -e "${YELLOW}🔥 ตั้งค่า Firewall...${NC}"
        
        # เช็คว่า port 80/443 เปิดอยู่หรือยัง
        if ! sudo ufw status | grep -q "80/tcp"; then
            sudo ufw allow 80/tcp
            echo -e "${GREEN}✅ เปิด port 80 แล้ว${NC}"
        fi
        
        if ! sudo ufw status | grep -q "443/tcp"; then
            sudo ufw allow 443/tcp
            echo -e "${GREEN}✅ เปิด port 443 แล้ว${NC}"
        fi
    else
        echo -e "${YELLOW}💡 ไม่ต้องเปิด port 80/443 (ใช้ Nginx/Apache proxy)${NC}"
    fi
    
    # 15. Reload Caddy
    echo -e "${YELLOW}🔄 Reload Caddy...${NC}"
    
    # เช็คว่า port 80/443 ถูกใช้หรือไม่
    PORT_80_IN_USE=false
    PORT_443_IN_USE=false
    
    if command -v lsof &> /dev/null; then
        if sudo lsof -i :80 -sTCP:LISTEN >/dev/null 2>&1; then
            PORT_80_IN_USE=true
            PORT_80_PROCESS=$(sudo lsof -i :80 -sTCP:LISTEN | tail -n 1 | awk '{print $2}')
        fi
        
        if sudo lsof -i :443 -sTCP:LISTEN >/dev/null 2>&1; then
            PORT_443_IN_USE=true
            PORT_443_PROCESS=$(sudo lsof -i :443 -sTCP:LISTEN | tail -n 1 | awk '{print $2}')
        fi
    fi
    
    # ถ้า port ถูกใช้ ให้แจ้งเตือนและแนะนำ Cloudflare Tunnel
    if [ "$PORT_80_IN_USE" = "true" ] || [ "$PORT_443_IN_USE" = "true" ]; then
        echo -e "${YELLOW}⚠️  พบ service อื่นใช้ port 80/443 อยู่${NC}"
        if [ "$PORT_80_IN_USE" = "true" ]; then
            echo -e "${YELLOW}   Port 80: ถูกใช้โดย process $PORT_80_PROCESS${NC}"
        fi
        if [ "$PORT_443_IN_USE" = "true" ]; then
            echo -e "${YELLOW}   Port 443: ถูกใช้โดย process $PORT_443_PROCESS${NC}"
        fi
        echo ""
        echo -e "${RED}⚠️  ไม่สามารถใช้ Caddy bind port 443 ได้เพราะ port ถูกใช้อยู่${NC}"
        echo ""
        echo -e "${BLUE}📝 ทางเลือก:${NC}"
        echo -e "${BLUE}   1. ใช้ Cloudflare Tunnel (ไม่ต้องใช้ port 80/443)${NC}"
        echo -e "${BLUE}      - Script: ./deploy-auto.sh${NC}"
        echo -e "${BLUE}      - คู่มือ: DEPLOY_CLOUDFLARE.md${NC}"
        echo ""
        echo -e "${BLUE}   2. ใช้ Caddy + Nginx/Apache Reverse Proxy (ไม่ชน Docker)${NC}"
        echo -e "${BLUE}      - Caddy bind port อื่น (8443)${NC}"
        echo -e "${BLUE}      - Nginx/Apache (port 443) proxy ไปที่ Caddy${NC}"
        echo -e "${BLUE}      - คู่มือ: ALTERNATIVES_NO_CLOUDFLARE.md${NC}"
        echo ""
        read -p "ต้องการใช้ Caddy + Nginx/Apache Reverse Proxy? (y/n) [default: n]: " use_nginx_proxy
        if [ "${use_nginx_proxy:-n}" = "y" ]; then
            echo -e "${GREEN}✅ ใช้ Caddy + Nginx/Apache Reverse Proxy${NC}"
            USE_NGINX_PROXY=true
            CADDY_PORT=8443
        else
            echo -e "${YELLOW}⚠️  ข้ามการตั้งค่า Caddy${NC}"
            echo -e "${YELLOW}💡 แนะนำ: ใช้ Cloudflare Tunnel หรือดูคู่มือ ALTERNATIVES_NO_CLOUDFLARE.md${NC}"
            SKIP_CADDY_START=true
            SKIP_CADDY_CONFIG=true
        fi
    fi
    
    # เช็คว่า Caddy service ทำงานอยู่หรือไม่
    if [ "$SKIP_CADDY_START" != "true" ]; then
        if sudo systemctl is-active --quiet caddy; then
            # Service ทำงานอยู่ - reload ได้
            sudo systemctl reload caddy
            echo -e "${GREEN}✅ Reload Caddy แล้ว${NC}"
        else
            # Service ไม่ทำงาน - ต้อง start ก่อน
            echo -e "${YELLOW}⚠️  Caddy service ไม่ทำงาน - กำลัง start...${NC}"
            
            # ถ้าใช้ Nginx proxy mode ให้ restart แทน start (เพื่อให้ใช้ config ใหม่)
            if [ "$USE_NGINX_PROXY" = "true" ]; then
                echo -e "${YELLOW}🔄 Restart Caddy (ใช้ config ใหม่)...${NC}"
                # ใช้ timeout เพื่อไม่ให้ค้าง
                timeout 10 sudo systemctl restart caddy 2>&1 || {
                    echo -e "${YELLOW}⚠️  Restart Caddy อาจมีปัญหา - กำลังเช็ค...${NC}"
                }
            else
                timeout 10 sudo systemctl start caddy 2>&1 || {
                    echo -e "${YELLOW}⚠️  Start Caddy อาจมีปัญหา - กำลังเช็ค...${NC}"
                }
            fi
            
            # รอสักครู่ให้ service start
            echo -e "${YELLOW}⏳ รอ Caddy start...${NC}"
            sleep 3
            
            # เช็คว่า start สำเร็จหรือไม่
            if sudo systemctl is-active --quiet caddy; then
                echo -e "${GREEN}✅ Start Caddy แล้ว${NC}"
                
                # Enable auto-start on boot
                sudo systemctl enable caddy
                echo -e "${GREEN}✅ Enable Caddy auto-start แล้ว${NC}"
            else
                echo -e "${RED}❌ Start Caddy ไม่สำเร็จ${NC}"
                echo ""
                echo -e "${YELLOW}📋 Error Log:${NC}"
                sudo journalctl -u caddy -n 20 --no-pager | tail -n 10
                echo ""
                echo -e "${YELLOW}💡 แนะนำ:${NC}"
                echo -e "${YELLOW}   1. เช็ค error log: sudo journalctl -u caddy -n 50${NC}"
                echo -e "${YELLOW}   2. เช็ค Caddyfile: sudo caddy validate --config /etc/caddy/Caddyfile${NC}"
                echo -e "${YELLOW}   3. เช็ค status: sudo systemctl status caddy${NC}"
                
                # แสดง error ถ้ามี
                if [ "$PORT_443_IN_USE" = "true" ] && [ "$USE_NGINX_PROXY" != "true" ]; then
                    echo ""
                    echo -e "${RED}⚠️  Port 443 ถูกใช้อยู่ - Caddy start ไม่ได้${NC}"
                    echo -e "${YELLOW}💡 แนะนำ: ใช้ Caddy + Nginx/Apache Reverse Proxy${NC}"
                    echo -e "${YELLOW}   - Caddy bind port อื่น (8443)${NC}"
                    echo -e "${YELLOW}   - ดูคู่มือ: ALTERNATIVES_NO_CLOUDFLARE.md${NC}"
                elif [ "$USE_NGINX_PROXY" = "true" ]; then
                    echo ""
                    echo -e "${YELLOW}💡 ตรวจสอบ:${NC}"
                    echo -e "${YELLOW}   - Caddyfile ต้อง bind port $CADDY_PORT (ไม่ใช่ 443)${NC}"
                    echo -e "${YELLOW}   - เช็ค: sudo cat /etc/caddy/Caddyfile${NC}"
                    echo -e "${YELLOW}   - แก้ไข: sudo nano /etc/caddy/Caddyfile${NC}"
                fi
            fi
        fi
    fi
    
    # ทดสอบ config
    echo -e "${YELLOW}🔍 ทดสอบ Caddy config...${NC}"
    if sudo caddy validate --config "$CADDYFILE" 2>&1; then
        echo -e "${GREEN}✅ Caddy config ถูกต้อง${NC}"
    else
        echo -e "${RED}❌ Caddy config มีปัญหา${NC}"
        echo -e "${YELLOW}💡 แนะนำ: แก้ไข Caddyfile${NC}"
        echo -e "${YELLOW}   - ดู config: sudo cat $CADDYFILE${NC}"
        echo -e "${YELLOW}   - แก้ไข: sudo nano $CADDYFILE${NC}"
        
        # ถ้าใช้ Nginx proxy mode ให้แสดงตัวอย่าง config ที่ถูกต้อง
        if [ "$USE_NGINX_PROXY" = "true" ]; then
            echo ""
            echo -e "${BLUE}📝 ตัวอย่าง Caddyfile ที่ถูกต้อง (port $CADDY_PORT):${NC}"
            echo -e "${BLUE}:$CADDY_PORT {${NC}"
            echo -e "${BLUE}    reverse_proxy localhost:$FREE_PORT${NC}"
            echo -e "${BLUE}}${NC}"
        fi
    fi
    fi
else
    echo -e "${YELLOW}⚠️  ข้ามการตั้งค่า Caddy (ติดตั้งไม่สำเร็จ)${NC}"
    echo -e "${YELLOW}💡 แนะนำ: ติดตั้ง Caddy ด้วยตนเอง แล้วรัน script ใหม่${NC}"
fi

# 16. แสดงผลลัพธ์
echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}🎉 Deploy เสร็จสิ้น!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
echo "📊 ข้อมูล App:"
echo "   - ชื่อโปรเจค: $PROJECT_NAME"
echo "   - Port: $FREE_PORT"
echo "   - Local URL: http://localhost:$FREE_PORT"

# เช็คว่า Caddy ใช้ได้หรือไม่
if [ "$SKIP_CADDY_CONFIG" = "true" ] || [ "$SKIP_CADDY_START" = "true" ]; then
    echo ""
    echo -e "${YELLOW}⚠️  Caddy ไม่สามารถใช้ได้ (port 443 ถูกใช้อยู่)${NC}"
    echo -e "${YELLOW}💡 แนะนำ: ใช้ Cloudflare Tunnel แทน${NC}"
    echo ""
    echo -e "${BLUE}📝 ขั้นตอนต่อไป:${NC}"
    echo -e "${BLUE}   1. ใช้ script: ./deploy-auto.sh (Cloudflare Tunnel version)${NC}"
    echo -e "${BLUE}   2. หรือดูคู่มือ: DEPLOY_CLOUDFLARE.md${NC}"
    echo ""
    echo -e "${GREEN}✅ App ทำงานที่ port $FREE_PORT แล้ว${NC}"
    echo -e "${GREEN}   - ทดสอบ: curl http://localhost:$FREE_PORT${NC}"
else
    echo "   - Public URL: https://$FULL_DOMAIN"
    echo ""
    echo "📝 คำสั่งที่มีประโยชน์:"
    echo "   - ดูสถานะ: pm2 status"
    echo "   - ดู logs: pm2 logs $PROJECT_NAME"
    echo "   - Restart: pm2 restart $PROJECT_NAME"
    echo "   - Caddy status: sudo systemctl status caddy"
    echo "   - Caddy logs: sudo journalctl -u caddy -f"
    echo ""
    echo "🌐 ตั้งค่า DNS ใน Cloudflare:"
    echo "   1. ไปที่ Cloudflare Dashboard"
    echo "   2. DNS > Records"
    echo "   3. Add record:"
    echo "      - Type: A"
    echo "      - Name: $SUBDOMAIN"
    echo "      - Target: [IP ของ VPS]"
    echo "      - Proxy: ON (สีส้ม) ✅"
    echo ""
    echo -e "${GREEN}✅ Caddy จะสร้าง SSL certificate อัตโนมัติ!${NC}"
    echo "   รอสักครู่ (1-5 นาที) แล้วเข้า: https://$FULL_DOMAIN"
    echo ""
fi
