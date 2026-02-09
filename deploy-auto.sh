#!/bin/bash

# 🚀 Auto Deploy Script สำหรับ Next.js + Cloudflare Tunnel
# ทำทุกอย่างให้อัตโนมัติ - รวมถึง Cloudflare!

set -e  # หยุดถ้ามี error

echo "🚀 เริ่ม Auto Deploy..."

# สีสำหรับ output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Domain ของคุณ
DOMAIN="evergreenchh.tech"

# รับ input ชื่อโปรเจค
echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}📝 ตั้งค่าข้อมูลโปรเจค${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

read -p "ชื่อโปรเจค (เช่น: chh, production, app): " PROJECT_NAME
PROJECT_NAME=${PROJECT_NAME:-chh}  # Default: chh

read -p "Subdomain (เช่น: app, prod, main) [default: $PROJECT_NAME]: " SUBDOMAIN
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

# 2. หา port ว่างอัตโนมัติ
echo -e "${YELLOW}🔍 หา port ว่าง...${NC}"

find_free_port() {
    for port in 3000 3001 3002 3003 3004 3005; do
        if ! lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            echo $port
            return
        fi
    done
    # ถ้าไม่เจอ ให้ใช้ random port
    echo $((3000 + RANDOM % 1000))
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
    # Vite ใช้ preview สำหรับ production
    if grep -q '"preview"' package.json; then
        START_CMD="run preview"
    else
        # ถ้าไม่มี preview script ให้ใช้ serve
        START_CMD="run preview"
        echo -e "${YELLOW}⚠️  ไม่พบ preview script - จะใช้ 'npm run preview'${NC}"
    fi
    echo -e "${GREEN}✅ ตรวจพบ: Vite${NC}"
else
    # ถ้าไม่เจอ ให้ถามหรือใช้ default
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
    # Vite ใช้ VITE_ prefix สำหรับ public variables
    ENV_PREFIX="VITE_"
else
    ENV_FILE=".env.production"
    # Next.js ใช้ NEXT_PUBLIC_ prefix
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
    # เพิ่ม VITE_PORT ถ้ายังไม่มี
    if ! grep -q "VITE_PORT" "$ENV_FILE"; then
        echo "VITE_PORT=$FREE_PORT" >> "$ENV_FILE"
    fi
fi

# 7. Build โปรเจค
echo -e "${YELLOW}🔨 Build โปรเจค...${NC}"
npm run build

# 8. สร้างไฟล์ ecosystem.config.cjs (ใช้ .cjs เพื่อรองรับ ES modules)
echo -e "${YELLOW}⚙️  สร้างไฟล์ PM2 Config...${NC}"

# เช็คว่า package.json มี "type": "module" หรือไม่
HAS_ESM=false
if [ -f "package.json" ] && grep -q '"type".*"module"' package.json; then
    HAS_ESM=true
    echo -e "${YELLOW}⚠️  ตรวจพบ ES modules - ใช้ .cjs extension${NC}"
fi

# สร้าง PM2 config ตามประเภทโปรเจค
if [ "$PROJECT_TYPE" = "vite" ]; then
    # Vite ใช้ preview และต้องระบุ port
    PM2_SCRIPT="npm"
    PM2_ARGS="run preview -- --port $FREE_PORT --host"
else
    # Next.js หรืออื่นๆ
    PM2_SCRIPT="npm"
    PM2_ARGS="$START_CMD"
fi

# ใช้ .cjs extension ถ้ามี ES modules หรือใช้ .js ถ้าไม่มี
if [ "$HAS_ESM" = "true" ]; then
    PM2_CONFIG_FILE="ecosystem.config.cjs"
else
    PM2_CONFIG_FILE="ecosystem.config.js"
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

# 12. ตั้งค่า Cloudflare Tunnel (อัตโนมัติ)
echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}☁️  ตั้งค่า Cloudflare Tunnel${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# เช็คว่ามี cloudflared หรือยัง
if ! command -v cloudflared &> /dev/null; then
    echo -e "${YELLOW}⚠️  ไม่พบ cloudflared - กำลังติดตั้ง...${NC}"
    
    # Download และติดตั้ง cloudflared
    mkdir -p ~/bin
    cd ~/bin
    
    if [ ! -f "cloudflared" ]; then
        echo -e "${YELLOW}📥 Downloading cloudflared...${NC}"
        wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
        chmod +x cloudflared
    fi
    
    # เพิ่มเข้า PATH
    if ! echo "$PATH" | grep -q "$HOME/bin"; then
        echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc
        export PATH="$HOME/bin:$PATH"
    fi
    
    echo -e "${GREEN}✅ ติดตั้ง cloudflared แล้ว${NC}"
fi

# เช็คว่า login Cloudflare แล้วหรือยัง
CLOUDFLARED_CONFIG_DIR="$HOME/.cloudflared"
mkdir -p "$CLOUDFLARED_CONFIG_DIR"

# เช็คว่า login แล้วหรือยัง (ลอง list tunnels)
if ! cloudflared tunnel list &>/dev/null; then
    echo -e "${YELLOW}🔐 ยังไม่ได้ login Cloudflare${NC}"
    echo "กรุณา login Cloudflare ก่อน:"
    echo "  1. รันคำสั่ง: cloudflared tunnel login"
    echo "  2. Copy URL ที่ได้ไปเปิดใน browser"
    echo "  3. Login และ authorize"
    echo "  4. รัน script นี้ใหม่"
    echo ""
    read -p "กด Enter เพื่อ login ตอนนี้ (หรือ Ctrl+C เพื่อข้าม): " 
    
    cloudflared tunnel login || {
        echo -e "${RED}❌ Login ไม่สำเร็จ - ข้าม Cloudflare Tunnel${NC}"
        SKIP_CLOUDFLARE=true
    }
fi

if [ "$SKIP_CLOUDFLARE" != "true" ]; then
    # เช็คว่ามี tunnel หรือยัง
    TUNNEL_EXISTS=false
    TUNNEL_LIST=$(cloudflared tunnel list 2>/dev/null || echo "")
    
    if echo "$TUNNEL_LIST" | grep -q "$PROJECT_NAME"; then
        TUNNEL_EXISTS=true
        # ดึง Tunnel ID (คอลัมน์แรก)
        TUNNEL_ID=$(echo "$TUNNEL_LIST" | grep "$PROJECT_NAME" | awk '{print $1}' | head -1)
        echo -e "${GREEN}✅ พบ tunnel เดิม: $TUNNEL_ID${NC}"
    else
        echo -e "${YELLOW}📦 สร้าง tunnel ใหม่...${NC}"
        TUNNEL_OUTPUT=$(cloudflared tunnel create "$PROJECT_NAME" 2>&1)
        
        if echo "$TUNNEL_OUTPUT" | grep -q "Created tunnel"; then
            # ดึง Tunnel ID จาก output (รูปแบบ: Created tunnel PROJECT_NAME with id xxxxx)
            TUNNEL_ID=$(echo "$TUNNEL_OUTPUT" | grep -oE 'id [a-f0-9-]+' | awk '{print $2}' | head -1)
            if [ -z "$TUNNEL_ID" ]; then
                # ลองวิธีอื่น
                TUNNEL_ID=$(echo "$TUNNEL_OUTPUT" | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1)
            fi
            echo -e "${GREEN}✅ สร้าง tunnel สำเร็จ: $TUNNEL_ID${NC}"
        else
            echo -e "${RED}❌ สร้าง tunnel ไม่สำเร็จ${NC}"
            echo "$TUNNEL_OUTPUT"
            SKIP_CLOUDFLARE=true
        fi
    fi
    
    if [ "$SKIP_CLOUDFLARE" != "true" ] && [ -n "$TUNNEL_ID" ]; then
        # สร้างไฟล์ config
        echo -e "${YELLOW}⚙️  สร้างไฟล์ Cloudflare config...${NC}"
        
        cat > "$CLOUDFLARED_CONFIG_DIR/config.yml" << EOF
tunnel: $TUNNEL_ID
credentials-file: $CLOUDFLARED_CONFIG_DIR/$TUNNEL_ID.json

ingress:
  - hostname: $FULL_DOMAIN
    service: http://localhost:$FREE_PORT
  - service: http_status:404
EOF
        
        echo -e "${GREEN}✅ สร้างไฟล์ config แล้ว${NC}"
        
        # ตั้งค่า DNS
        echo -e "${YELLOW}🌐 ตั้งค่า DNS...${NC}"
        cloudflared tunnel route dns "$PROJECT_NAME" "$FULL_DOMAIN" 2>/dev/null || {
            echo -e "${YELLOW}⚠️  ตั้งค่า DNS ไม่สำเร็จ - อาจต้องตั้งเองใน Cloudflare Dashboard${NC}"
            echo "   - Type: CNAME"
            echo "   - Name: $SUBDOMAIN"
            echo "   - Target: $TUNNEL_ID.cfargotunnel.com"
            echo "   - Proxy: ON (สีส้ม)"
        }
        
        # ตั้งค่า systemd service
        echo -e "${YELLOW}⚙️  ตั้งค่า systemd service...${NC}"
        
        CLOUDFLARED_PATH=$(which cloudflared)
        
        sudo tee /etc/systemd/system/cloudflared-$PROJECT_NAME.service > /dev/null << EOF
[Unit]
Description=Cloudflare Tunnel - $PROJECT_NAME
After=network.target

[Service]
Type=simple
User=$(whoami)
ExecStart=$CLOUDFLARED_PATH tunnel --config $CLOUDFLARED_CONFIG_DIR/config.yml run
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF
        
        sudo systemctl daemon-reload
        sudo systemctl enable "cloudflared-$PROJECT_NAME"
        sudo systemctl restart "cloudflared-$PROJECT_NAME"
        
        echo -e "${GREEN}✅ ตั้งค่า Cloudflare Tunnel แล้ว${NC}"
    fi
fi

# 13. แสดงผลลัพธ์
echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}🎉 Deploy เสร็จสิ้น!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
echo "📊 ข้อมูล App:"
echo "   - ชื่อโปรเจค: $PROJECT_NAME"
echo "   - Port: $FREE_PORT"
echo "   - Local URL: http://localhost:$FREE_PORT"
if [ "$SKIP_CLOUDFLARE" != "true" ] && [ -n "$TUNNEL_ID" ]; then
    echo "   - Public URL: https://$FULL_DOMAIN"
    echo "   - Tunnel ID: $TUNNEL_ID"
fi
echo ""
echo "📝 คำสั่งที่มีประโยชน์:"
echo "   - ดูสถานะ: pm2 status"
echo "   - ดู logs: pm2 logs $PROJECT_NAME"
echo "   - Restart: pm2 restart $PROJECT_NAME"
if [ "$SKIP_CLOUDFLARE" != "true" ]; then
    echo "   - Cloudflare status: sudo systemctl status cloudflared-$PROJECT_NAME"
    echo "   - Cloudflare logs: sudo journalctl -u cloudflared-$PROJECT_NAME -f"
fi
echo ""
if [ "$SKIP_CLOUDFLARE" != "true" ] && [ -n "$TUNNEL_ID" ]; then
    echo -e "${GREEN}✅ Cloudflare Tunnel ทำงานแล้ว!${NC}"
    echo "   รอสักครู่ (1-2 นาที) แล้วเข้า: https://$FULL_DOMAIN"
else
    echo -e "${YELLOW}⚠️  Cloudflare Tunnel ยังไม่ตั้งค่า${NC}"
    echo "   ตั้งค่าด้วยตนเอง: ดู DEPLOY_CLOUDFLARE.md"
fi
echo ""
