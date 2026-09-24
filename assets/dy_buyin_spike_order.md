# 百应浏览器登录 · 技术验证 Spike（独立功能，不影响现有系统）

## 目的
只验证一件事：平台后端（Node/Next.js）能否在运行环境里成功拉起一个无头浏览器（Chromium），打开巨量百应登录页，并把里面的「抖音 App 扫码二维码」画面取回给前端展示。
这是后续「平台配置维度 → 浏览器登录百应 → 自动采集 → 看板」整个产品的唯一硬卡点。本阶段不做采集、不做签名、不入库业务数据。

## 范围与隔离
- 新建独立 git 分支：`feat/dy-buyin-spike`（基于当前 SOP 工作分支创建，不要在 main 上做）。
- 只新增独立页面与独立 API，不改任何现有页面/布局/导航，不在侧边栏加入口（直接用 URL 访问）。
- 不 deploy、不 push main、不插数据库业务数据。
- 保留 dark/light 风格即可，UI 极简，不追求美观。

## 需要新增的内容

### 1. 页面：`/buyin-spike`
- 一个标题（如「百应登录 · 技术验证」）；
- 一个按钮「连接百应 / 获取二维码」；
- 一块图片/状态展示区：点击后调用下方 API，把返回的二维码截图显示出来；
- 显示后端返回的调试信息：浏览器是否成功启动、页面是否加载、二维码是否找到、各步骤耗时、错误堆栈（如有）。
- 加一个「重新获取」按钮。

### 2. API：`/api/buyin-spike/qr`（GET 或 POST 均可）
- 在服务端启动一个无头 Chromium，打开百应登录页：
  `https://buyin.jinritemai.com/mpa/account/login?log_out=1&type=24`
- 等待页面与二维码加载。注意：二维码在 `open.douyin.com/qrconnect` 的 iframe 内，需要等待该 iframe 及内部 canvas/img 渲染完成（设置合理超时，如 15~20 秒）。
- 截取二维码画面（优先截二维码 iframe 元素；做不到则截整个登录页可视区），以 base64 data URL（image/png）返回。
- 返回 JSON：
  ```json
  {
    "ok": true,
    "image": "data:image/png;base64,...",
    "debug": {
      "browserLaunched": true,
      "pageLoaded": true,
      "qrFound": true,
      "timingMs": { "launch": 0, "goto": 0, "qr": 0, "screenshot": 0 },
      "pageUrl": "...",
      "engine": "playwright|puppeteer"
    }
  }
  ```
  任一步失败也要返回结构化结果：`ok:false` + `failedStep` + `error` 信息（不要让接口 500 白屏）。
- 浏览器实例用完务必关闭，避免进程泄漏。

### 3. 浏览器引擎
- 自行选择在本环境最可能跑通的方案（Playwright Chromium 或 Puppeteer），并把安装过程中是否需要额外系统依赖、是否成功，如实写进调试/交付信息。
- 若标准 npm 安装的浏览器在 serverless/容器内无法启动或缺少系统库，请尝试可行的轻量替代（如 @sparticuz/chromium 一类），但所有尝试与结论都要回报。

## 交付前自检
- 构建（项目实际 build 命令）通过，无类型错误；
- `/buyin-spike` 可直接访问，按钮可点击；
- 实际调用一次 API：报告 `ok` 是 true 还是 false；若 true，确认 image 非空、能看到二维码；若 false，明确卡在哪一步（浏览器装不上 / 启动失败 / 页面打不开 / 二维码超时），这本身就是有价值的结论。
- 不影响现有页面与构建。

## 交付物
- 改动清单、选用引擎与安装情况、构建结果；
- 最重要：API 实测结论（成功/失败 + failedStep + 关键日志），写进结果回报。
