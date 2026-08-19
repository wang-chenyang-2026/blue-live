#!/bin/bash
APP_DIR="$HOME/blue-live"
LOG_FILE="$HOME/blue-live/auto-deploy.log"

# 加载 Node.js 环境变量
export PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH"

cd "$APP_DIR" || exit 1
git fetch origin main 2>/dev/null
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" = "$REMOTE" ]; then
    exit 0
fi
echo "========================================" >> "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 发现新代码，开始自动部署..." >> "$LOG_FILE"
git pull origin main >> "$LOG_FILE" 2>&1
pnpm install --frozen-lockfile >> "$LOG_FILE" 2>&1 || pnpm install >> "$LOG_FILE" 2>&1
pnpm build >> "$LOG_FILE" 2>&1
if [ $? -eq 0 ]; then
    pm2 restart blue-live >> "$LOG_FILE" 2>&1
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 部署成功" >> "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 构建失败，回滚..." >> "$LOG_FILE"
    git reset --hard "$LOCAL"
    pnpm install --frozen-lockfile >> "$LOG_FILE" 2>&1 || pnpm install >> "$LOG_FILE" 2>&1
    pnpm build >> "$LOG_FILE" 2>&1
    pm2 restart blue-live >> "$LOG_FILE" 2>&1
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 已回滚" >> "$LOG_FILE"
fi
