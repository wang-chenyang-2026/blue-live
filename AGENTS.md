# AGENTS.md

## 项目概览
直播代运营管理系统——面向直播代运营团队的内部管理工具。3品牌8账号，4种角色（PM/运营/中控/主播），涵盖排班、成本、考勤、工作台等核心模块。

## 技术栈
- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (Radix UI)
- **Styling**: Tailwind CSS 4 + 深色主题
- **数据存储**: localStorage（后续可扩展后端）
- **Excel 解析**: xlsx 库

## 目录结构
```
src/
├── app/                    # 页面路由
│   ├── page.tsx            # Dashboard 首页
│   ├── layout.tsx          # 根布局（AppProvider + AppShell + ThemeSetter）
│   ├── globals.css         # 全局样式 + 品牌色 CSS 变量
│   ├── schedule/           # M1 排班管理
│   ├── cost/               # M3 成本核算
│   ├── attendance/         # M4 考勤管理
│   ├── workstation/        # M8 主播工作台
│   ├── feedback/           # 问题反馈（中控）
│   ├── data-report/        # 数据报表（占位）
│   ├── visual/             # 视觉对接（占位）
│   └── sop/                # SOP管理（占位）
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx    # 应用外壳（Header + Sidebar + Main）
│   │   ├── AppSidebar.tsx  # 侧边栏导航 + 角色/品牌切换器
│   │   └── ThemeSetter.tsx # 客户端暗色主题注入
│   └── ui/                 # shadcn/ui 组件库
├── contexts/
│   └── AppContext.tsx      # 全局状态（品牌/角色/isClient）
└── lib/
    ├── types.ts            # 全部类型定义
    ├── constants.ts        # 品牌配置/角色权限/模块映射
    ├── store.ts            # localStorage CRUD + 利润率计算
    └── utils.ts            # cn() 工具
```

## 构建与测试命令
- `pnpm install` — 安装依赖
- `pnpm run dev` — 开发模式（端口 5000）
- `pnpm run build` — 生产构建
- `pnpm ts-check` / `pnpm lint --quiet` — 静态检查

## 编码规范
- TypeScript strict 模式，禁止隐式 any
- `use client` + `useEffect` 保护所有 localStorage/Date 调用
- 不在 JSX 渲染逻辑中直接使用 `new Date()` / `typeof window`
- 统一使用 `isClient` 状态守卫避免 SSR/CSR 不一致
- 深色主题通过 Tailwind `dark:` class 实现，`<html>` 上由 ThemeSetter 客户端添加 `dark` class
- 组件优先使用 shadcn/ui

## 业务逻辑要点
- 3品牌：vivo（3账号）、iQOO（3账号）、IOT（2账号）
- 排班冲突检测：`checkScheduleConflict()` 检查同一人同一时段
- 成本六大项 + 收入(时长×小时费) + KPI扣减5% → 利润率
- 考勤支持钉钉Excel导入，排班对比功能
- 角色权限控制侧边栏可见模块
- 「外部合作」角色：可见全部业务模块页面布局/维度，但业务数据为空。服务端由 `src/lib/api-permission.ts` 的 `getRequestRole`/`isExternalRoleRequest`/`maskExternalBusiness` 门控（middleware 注入的 `x-user-role` 为 URL 编码中文），对 8 个业务数据 API 返回空版本（列表 []/数值 0），纯字典枚举接口（如 /api/market-monitor/categories）放行；/api/users* 对外部合作返回 403。workstation 用 localStorage 数据源，在页面内按 `currentRole==='外部合作'` 置空。新加业务数据接口需同步注入门控。

## 常见问题修复
- Hydration Error → 确保 localStorage/Date 在 useEffect 中调用，SSR 返回固定占位
- Turbopack 缓存损坏 → `rm -rf .next` 后重启 dev server
- dark class 不生效 → 检查 ThemeSetter 是否正确注入

## SOP管理板块（第二期：分级+上传+AI提炼）
- 两级分类（应用层常量，见 `src/lib/sop-taxonomy.ts`，旧表 sop_categories 保留不删、页面不再以它为主）：一级 scope=general/vivo/iqoo_douyin/iqoo_kuaishou；二级 sub_category=product/culture/management/live_standard/other（旧 category 列保留）。
- sop_documents 新增列：scope、sub_category、source_type(feishu/tencent/manual)、ai_summary、ai_keypoints、ai_status(pending/processing/done/failed)、ai_error、uploaded_by/uploader_name、is_active、remark。已读表 `sop_read_logs(doc_id,user_id,read_at, unique)`。
- 接口：GET list（按角色+users.brand 做 scope 过滤，回传 scopes/canUpload/read）、GET detail、POST create（仅 PM/运营，403 其他角色）、PATCH（仅 PM/运营，重置提炼）、POST /[id]/read（幂等已读）。
- 上传仅 PM/运营；链接限 feishu.cn/larksuite.com 或 docs.qq.com，create 校验 http(s) 与域名；上传/编辑后异步 `runSopRefine`（`src/lib/sop-refine.ts`）：飞书可读则抓正文（复用 feishu-notify 的 getTenantToken，见 `src/lib/sop-ai.ts`），腾讯读不到正文走手动要点。
- **AI 提炼红线**：只读 `process.env.BLUEAI_API_KEY`；缺失或网关无文本工具→稳定落 ai_status=failed 并写 ai_error，绝不伪造（当前 preview 环境密钥未注入，实测落 failed）。飞书 app 凭证仅存在于 feishu-notify.ts，新代码不得硬编码密钥。
- 权限：middleware 注入 x-user-id/phone/role/name（**不注入 brand**），SOP scope 过滤需按 phone 查 users.brand；可见域=PM/运营/超管全部 4 域，其他内部角色=general+自身 brand 域，外部合作列表空/详情404。服务端角色判定复用 `src/lib/api-permission.ts` 的 isExternalRoleRequest/getRequestRole。

## SOP管理板块（第二期升级·UI v2.5：三栏 + 分发统计 + 删除）
- **双主题跟随全站 blue-theme（不要再钉固定浅色）**：SOP 不再用固定浅色。主题机制：平台用 `blue-theme`(localStorage 默认 dark) + ThemeSetter 在 `<html>` 上 toggle `dark` class，Tailwind `dark:` 变体随 `.dark` 祖先切换。SOP 用 `src/components/sop/sop-theme.css` 定义 `.sop-scope`（日间=飞书指令浅色 Token）与 `.dark .sop-scope`（夜间=复用平台变量 `var(--background)/var(--card)/var(--border)/var(--muted)/var(--primary)/var(--foreground)` + 个别 SOP 深色 tweak），所有 SOP 元素用 `var(--sop-*)`（bg/panel/border/line/t1-t4/primary/primary-soft/primary-bg/muted/success/danger 等）内联引用，故切换即生效无需刷新。业务线圆点用 CSS 类 `.dot-general/vivo/iqoo_douyin/iqoo_kuaishou`（日夜各一套）。根容器 class=`sop-scope`（不要改回 sop-light-scope）；**不改 :root/全局变量/blue-theme/通用组件**。新增 SOP 配色/样式一律往 sop-theme.css 加 var 或用平台变量，不要硬编码单主题 hex。
- **两栏列表 + 独立文档页（v2.7）**：/sop 改为 232px 左业务线 + 右区（分类 Tabs + 双列卡片网格），卡片整卡点击 `router.push('/sop/doc/[id]?scope=&category=')` 跳独立阅读页；**删除入口在每张卡片右上角**（仅 PM/运营渲染，hover 显示，stopPropagation+二次确认，调 DELETE）；卡片三行=标题+来源标签+需考核 / AI 提炼摘要 / 状态徽标+上传角色·更新时间+行尾(已提炼「查看正式内容→」/提炼中「待提炼完成后分发」/否则「未分发」)。/sop/doc/[id] 用 useSearchParams 读取 scope/category 造返回链（需 Suspense 包裹），居中面板最大 1000px，复用 `src/components/sop/SopDocDetailBody.tsx` 渲染标题+chips+AI框+正式内容+查看原文。列表不再有内联右栏详情，无 activeId。
- **三态状态机（真实，不造假）**：done=已提炼(绿+已同步N人)、processing=提炼中(蓝，待提炼完成后分发)、其余(pending/failed/null)=资料待补充(灰，未分发)。存量 17 条未跑过提炼 → ai_status=pending 展示为资料待补充（不要误判为提炼中）。
- **分发人数实时统计**：`src/lib/sop-sync.ts` 按业务线查 users（status=approved、role∈PM/运营/中控/主播、排除外部合作）；general=全部内部；品牌线=brand 匹配者 + 品牌为空或 'all' 的 PM/运营计全业务线。提供 computeScopeSync/getScopeSyncStats/formatSyncDetail(主播X·运营Y·中控Z，PM 计入运营)/syncStatusLabel。**不落库、不凑数**。
- **删除**：仅 PM/运营（服务端 DELETE /api/sop/documents/[id] 强制 403），同时级联删 sop_read_logs（eq doc_id）。前端 SopDocDetailBody 内二次确认。
- **版本流转**：sop_documents 新增列 content_excerpt text、prev_version_at timestamptz、remark；runSopRefine 支持 bumpVersion=true（PATCH 内容变更时 version+1 并记 prev_version_at）；POST 触发后 version 保持 1。
- 关键词搜索匹配 title 与 ai_summary（supabase `.or('title.ilike.%..%,ai_summary.ilike.%..%')`）。测试 JWT 可用 node:crypto 手工 HS256 签名（secret 见 src/lib/auth-token.ts，不硬编码进产物）。

## SOP管理板块（第一期：制度+培训文档库 查阅/检索/权限）
- 库：sop_documents（制度/培训统一表：doc_type=management|training、category、applicable_post/applicable_brand 为 jsonb 数组、visibility=internal|general、needs_quiz、status、version）与字典表 sop_categories（type=category/post/brand、label、sort_order）。
- 页面：`/sop`（文档库：全部/制度/培训分页签 + category/brand 下拉 + 关键词，卡片显示 标题/分类/品牌/来源状态/需考核；来源有 external_url 显示"查看文档"，无则"资料待补充"）、`/sop/doc/[id]` 详情页（全字段；external_url 新标签打开，无则占位）。
- API：`/api/sop/documents`（GET，支持 doc_type/category/brand/keyword）、`/api/sop/documents/[id]`、`/api/sop/categories`。均只读。
- 权限：复用 `src/lib/api-permission.ts` 的 `isExternalRoleRequest`；内部角色可见全部 published；「外部合作」仅 visibility=general（本期 17 条全 internal，故外部为空态/详情 404）。**未改动既有总闸 maskExternalBusiness**，SOP 门控直接在路由内做。
- 避坑：jsonb 数组列（applicable_brand）不能直接用 supabase-js `.contains([x])`（会序列化成 `{..}` 文本数组字面量，PostgREST 报 invalid input syntax for type json）；应在 DB 查完其他条件后，内存中 `applicable_brand.includes(brand)` 过滤（数据量小）。
- 数据：17 条已入库（制度4 management=日常管理类，培训13；needs_quiz=6；external_url 有值 2 条：南京字节 oceanengine、vivo直播违规注意事项 feishu——验收写"3条"与实际源数据不符，按源数据 2 条为准）。
