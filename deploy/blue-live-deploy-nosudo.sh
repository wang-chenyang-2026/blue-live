#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="$HOME/blue-live"
REPO_URL='https://github.com/wang-chenyang-2026/blue-live.git'
NODE_VERSION='v20.18.0'
NODE_DIR="$HOME/.local/node-${NODE_VERSION}-linux-x64"
NODE_TARBALL="https://npmmirror.com/mirrors/node/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz"

echo -e "${GREEN}[1/7]${NC} 安装 Node.js ${NODE_VERSION}..."
if [ ! -d "$NODE_DIR" ]; then
    mkdir -p "$HOME/.local"
    echo "  下载 Node.js 从 npmmirror..."
    curl -fsSL "$NODE_TARBALL" -o /tmp/node.tar.xz
    echo "  解压到 $NODE_DIR..."
    tar -xJf /tmp/node.tar.xz -C "$HOME/.local"
    rm -f /tmp/node.tar.xz
fi
export PATH="$NODE_DIR/bin:$PATH"
echo "  Node.js: $(node -v)"
echo "  npm: $(npm -v)"

echo -e "${GREEN}[2/7]${NC} 配置 npm registry..."
npm config set registry https://registry.npmmirror.com
echo "  registry: $(npm config get registry)"

echo -e "${GREEN}[3/7]${NC} 安装 pnpm 和 pm2..."
npm install -g pnpm pm2
echo "  pnpm: $(pnpm -v)"
echo "  pm2: $(pm2 -v)"

echo -e "${GREEN}[4/7]${NC} 拉取代码..."
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR" && git pull origin main
else
    cd "$HOME" && git clone "https://ghfast.top/$REPO_URL" blue-live
    cd "$APP_DIR"
fi

echo -e "${GREEN}[5/7]${NC} 安装依赖..."
pnpm install --frozen-lockfile || pnpm install

echo -e "${GREEN}[6/7]${NC} 构建项目..."
pnpm build

echo -e "${GREEN}[7/7]${NC} 启动应用..."
pm2 delete blue-live 2>/dev/null || true
pm2 start node_modules/next/dist/bin/next --name blue-live -- start -p 8080 -H 0.0.0.0
pm2 save

echo -e "${GREEN}写入 PATH 到 .bashrc...${NC}"
if ! grep -q "node-${NODE_VERSION}-linux-x64" "$HOME/.bashrc"; then
    echo "" >> "$HOME/.bashrc"
    echo "# Node.js ${NODE_VERSION}" >> "$HOME/.bashrc"
    echo "export PATH=\"$NODE_DIR/bin:\$PATH\"" >> "$HOME/.bashrc"
    echo "  PATH 已写入 ~/.bashrc"
else
    echo "  PATH 已存在于 ~/.bashrc"
fi

echo ''
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  部署完成！http://0.0.0.0:8080${NC}"
echo -e "${GREEN}=========================================${NC}"
