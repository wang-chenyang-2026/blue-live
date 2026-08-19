#!/bin/bash
set -e
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
APP_DIR="$HOME/blue-live"
REPO_URL='https://github.com/wang-chenyang-2026/blue-live.git'

echo -e "${GREEN}[1/7]${NC} 安装 nvm..."
export NVM_DIR="$HOME/.nvm"
if [ ! -d "$NVM_DIR" ]; then
    curl -o- https://ghfast.top/https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo -e "${GREEN}[2/7]${NC} 安装 Node.js 20..."
if ! command -v node &> /dev/null; then
    nvm install 20
    nvm use 20
    nvm alias default 20
fi
echo "  Node.js: $(node -v)"

echo -e "${GREEN}[3/7]${NC} 安装 pnpm..."
command -v pnpm &> /dev/null || npm install -g pnpm

echo -e "${GREEN}[4/7]${NC} 安装 PM2..."
command -v pm2 &> /dev/null || npm install -g pm2

echo -e "${GREEN}[5/7]${NC} 拉取代码..."
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR" && git pull origin main
else
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

echo -e "${GREEN}[6/7]${NC} 安装依赖..."
pnpm install --frozen-lockfile || pnpm install

echo -e "${GREEN}[7/7]${NC} 构建项目..."
pnpm build

echo -e "${GREEN}[8/8]${NC} 启动应用..."
pm2 delete blue-live 2>/dev/null || true
PORT=8080 pm2 start node_modules/.bin/next --name blue-live -- start -p 8080 -H 0.0.0.0
pm2 save

echo ''
echo -e "${YELLOW}=========================================${NC}"
echo -e "${YELLOW}  部署完成！${NC}"
echo -e "${YELLOW}  访问地址: http://$(hostname -I | awk '{print $1}'):8080${NC}"
echo -e "${YELLOW}  PM2 状态: pm2 status${NC}"
echo -e "${YELLOW}  查看日志: pm2 logs blue-live${NC}"
echo -e "${YELLOW}=========================================${NC}"
echo ''
echo -e "${YELLOW}提示: 如需开机自启，请运行:${NC}"
echo -e "  pm2 startup"
echo -e "  pm2 save"
