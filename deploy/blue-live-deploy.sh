#!/bin/bash
set -e
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
APP_DIR='/home/nexhub/blue-live'
REPO_URL='https://github.com/wang-chenyang-2026/blue-live.git'

echo -e '${GREEN}[1/7]${NC} 检查 Node.js...'
if command -v node &> /dev/null; then
    NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VER" -lt 20 ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "  Node.js: $(node -v)"

echo -e '${GREEN}[2/7]${NC} 检查 pnpm...'
command -v pnpm &> /dev/null || npm install -g pnpm

echo -e '${GREEN}[3/7]${NC} 检查 PM2...'
command -v pm2 &> /dev/null || npm install -g pm2

echo -e '${GREEN}[4/7]${NC} 拉取代码...'
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR" && git pull origin main
else
    cd /home/nexhub && git clone "$REPO_URL" blue-live
    cd "$APP_DIR"
fi

echo -e '${GREEN}[5/7]${NC} 安装依赖...'
pnpm install --frozen-lockfile || pnpm install

echo -e '${GREEN}[6/7]${NC} 构建项目...'
pnpm build

echo -e '${GREEN}[7/7]${NC} 启动应用...'
pm2 delete blue-live 2>/dev/null || true
PORT=3000 pm2 start node_modules/.bin/next --name blue-live -- start -p 3000 -H 0.0.0.0
pm2 save
pm2 startup systemd -u nexhub --hp /home/nexhub 2>/dev/null || true

echo -e '${YELLOW}配置 Nginx...${NC}'
command -v nginx &> /dev/null || (sudo apt-get update && sudo apt-get install -y nginx)
sudo tee /etc/nginx/sites-available/blue-live > /dev/null <<'NGINXCONF'
server {
    listen 8080;
    server_name live.bluexh.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }
}
NGINXCONF
sudo ln -sf /etc/nginx/sites-available/blue-live /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx && sudo systemctl enable nginx

echo ''
echo -e '${GREEN}=========================================${NC}'
echo -e '${GREEN}  部署完成！https://live.bluexh.com${NC}'
echo -e '${GREEN}=========================================${NC}'
