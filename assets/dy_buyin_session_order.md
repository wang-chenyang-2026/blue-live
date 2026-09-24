# 百应扫码登录 · 常驻会话闭环（在 spike 基础上升级）

## 目的
当前 /buyin-spike 只返回一张二维码截图，浏览器返回后即关闭，用户扫码后无任何反应。升级为「常驻浏览器会话 + 前端轮询登录状态」，让扫码真正完成并保存登录 cookie。

## 分支
在 `feat/dy-buyin-spike` 分支上改。不 deploy。

## 后端：常驻会话管理
新增一个服务端会话注册表（模块级内存 Map，dev server 常驻进程内有效），保存：sessionId、browser、context/page、二维码所在 page、创建时间、状态、cookie、错误。带超时兜底（如 5 分钟未完成自动关闭并标记 expired）和清理逻辑，避免进程泄漏。

新增/改造 API（均需已登录态，沿用现有鉴权）：

### 1. POST /api/buyin-spike/session/start
- 启动无头 Chromium（沿用已验证可用的启动参数：--no-sandbox、--disable-dev-shm-usage、--disable-blink-features=AutomationControlled、Chrome/134 UA、zh-CN）。
- 打开百应登录页 `https://buyin.jinritemai.com/mpa/account/login?log_out=1&type=24`，等待 open.douyin.com/qrconnect iframe 稳定，截取二维码 <img class=qr-image>（复用现有取码与重试逻辑）。
- 关键：**不要关闭浏览器**，把实例存入会话表，返回 `{ ok, sessionId, image, status:'waiting_scan' }`。
- 若已有未过期会话，可复用或先关闭旧的再建新的（避免堆积）。

### 2. GET /api/buyin-spike/session/status?sessionId=xxx
- 检查该会话当前 page.url 与登录态（沿用 skill 的判断：URL 进入 buyin 业务路径 / 未被踢到 douyinec.com / 不在 /mpa/account/login 即视为已登录）。
- 用户扫码成功后页面会自动跳转。检测到登录成功：
  - 提取 cookie（至少 buyin 两个 host：buyin.jinritemai.com；如可顺带 compass.jinritemai.com 更完整——可再开一次 compass 首页触发其复用 session）。
  - 返回 `{ ok:true, status:'logged_in', accountHint, cookieCount }`；cookie 安全存到会话（后续采集用），不要把完整 cookie 值回显到响应里，只回数量。
  - 登录成功后可保留浏览器一小段时间供后续采集，或按设计关闭；至少在返回成功后由前端停止轮询。
- 仍在扫码页：返回 `{ status:'waiting_scan' }`。
- 会话不存在/过期：返回明确状态（expired / not_found），前端引导重新获取。
- 任何异常结构化返回，不 500。

### 3.（可选）POST /api/buyin-spike/session/cancel
- 主动关闭并清理指定会话。

## 前端：/buyin-spike 页面改造
- 「连接百应」改为调用 start，拿到 sessionId 与二维码。
- 展示二维码后**自动每 2~3 秒轮询 status**，并显示状态：等待扫码… / 登录成功 / 已过期请重新获取。
- 登录成功：展示成功提示与识别到的账号、cookie 数量；停止轮询。
- 保留「重新获取」：先 cancel/关闭旧会话再 start；组件卸载时取消轮询并尽量 cancel 会话，防止泄漏。
- 保留调试信息区（可折叠）。

## 自检（必须真实走查）
- 构建通过、无类型错误；
- start 能返回 sessionId 与可扫描二维码；
- status 在未扫码时稳定返回 waiting_scan；
- **模拟/真实登录跳转后能变为 logged_in 并取到 cookie**（至少用脚本驱动一次页面跳转验证状态切换与 cookie 提取逻辑；二维码真实扫码环节由用户实测）；
- 会话超时能自动清理；浏览器进程不残留；
- 不影响其他页面。

## 交付
改动清单 + 各接口说明 + 构建结果 + 状态轮询与 cookie 提取的验证结论。
