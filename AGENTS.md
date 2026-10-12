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
- **原文内联展示（v2.8）**：/sop/doc/[id] 在「内容摘录」下方渲染「正式内容/原文」全文（`content_body` 列，纯文本 `whitespace-pre-wrap` 安全渲染，不 dangerouslySetInnerHTML）；**只有顶部元信息行一个外链**（文案随来源：查看飞书原文/查看腾讯文档原文，target=_blank rel=noopener noreferrer），底部大跳转按钮已删除。详情 GET 逻辑：source_type=feishu 且 content_body 为空时，服务端用 `fetchFeishuDocBody`（src/lib/sop-ai.ts，报错用 AbortController 12s 超时）按 external_url 实时抓取一次并回存 content_body；腾讯文档/无权限/失败一律不抛错、content_body 保持 null，页面显示「原文内容暂无法直接展示，请点击顶部「查看原文」链接访问。」。不改 AI 提炼框与内容摘录。
- **三态状态机（真实，不造假）**：done=已提炼(绿+已同步N人)、processing=提炼中(蓝，待提炼完成后分发)、其余(pending/failed/null)=资料待补充(灰，未分发)。存量 17 条未跑过提炼 → ai_status=pending 展示为资料待补充（不要误判为提炼中）。
- **分发人数实时统计**：`src/lib/sop-sync.ts` 按业务线查 users（status=approved、role∈PM/运营/中控/主播、排除外部合作）；general=全部内部；品牌线=brand 匹配者 + 品牌为空或 'all' 的 PM/运营计全业务线。提供 computeScopeSync/getScopeSyncStats/formatSyncDetail(主播X·运营Y·中控Z，PM 计入运营)/syncStatusLabel。**不落库、不凑数**。
- **删除**：仅 PM/运营（服务端 DELETE /api/sop/documents/[id] 强制 403），同时级联删 sop_read_logs（eq doc_id）。前端 SopDocDetailBody 内二次确认。
- **版本流转**：sop_documents 新增列 content_excerpt text、prev_version_at timestamptz、remark；runSopRefine 支持 bumpVersion=true（PATCH 内容变更时 version+1 并记 prev_version_at）；POST 触发后 version 保持 1。
- 关键词搜索匹配 title 与 ai_summary（supabase `.or('title.ilike.%..%,ai_summary.ilike.%..%')`）。测试 JWT 可用 node:crypto 手工 HS256 签名（secret 见 src/lib/auth-token.ts，不硬编码进产物）。

## SOP管理板块（v2.9：本地文件上传 + 对象存储 + 文本提取 + 文档页文件展示）
- **sop_documents 新增列**（db upgrade 增量）：`file_url` text（对象存储 key）、`file_kind` text（pdf/word/ppt/text/image/other）、`mime_type` text、`file_size` bigint（字节）。`file_name` 用既有 varchar 列（勿重复加）。`source_type` 新增取值 `'file'`（原 feishu/tencent/manual 保持）。
- **存储通道**：Supabase Storage 私有桶 `sop-files`（此项目环境实测可用；bucket 域名 supabase2.aidap-global.cn-beijing.volces.com）。对象 key=`randomUUID().slice(0,8)/安全文件名`，防穿越、防覆盖。`src/lib/sop-storage.ts`：ensureSopBucket/uploadSopFile/deleteSopFile/sopFileSignedUrl(key,expires)/sopFileDownloadUrl。
- **类型与大小白名单**：`src/lib/file-extract.ts`：EXT_MAP（见下）+ 真实内容嗅探 sniffFile（PDF 魔数 %PDF、docx/pptx 魔数 PK、svg <svg）+ `MAX_DOC_BYTES=30MB`/`MAX_IMAGE_BYTES=10MB`。extractFileText：pdf 用 pdf-parse、docx 用 mammoth、pptx 用 jszip 抽 slide XML `<a:t>`、txt/md utf8、老 doc/ppt latin1 剥非可见字符尽力降级、图片不 OCR 返回空。normalize 剥 \r\0、压多行、截 200k。提取失败不阻断上传（content_body 留空）。
- **上传接口**：POST /api/sop/documents 支持 `multipart/form-data`（`Content-Type` 含 multipart 即走 `handleFileUpload(request, ctx)`，否则原 JSON 链接模式不变）。仅 PM/运营（403 其他角色）；文件 insert 后用 `content_body` 作为正文来源 `void runSopRefine(newId)`（改 `src/lib/sop-refine.ts`：source_type='file' 时 body=content_body，否则 feishu 才 fetch，见 v2.8）。失败清理已写对象（防半截对象残留）。
- **详情 GET**：返回 file_* 字段；source_type='file' 且 file_url 时给可见用户签发 `file_signed_url`（createSignedUrl 900s），失败置 null。
- **DELETE**：仅 PM/运营；级联删 sop_read_logs + 同步 `deleteSopFile(file_url)`（先查行取 file_url 再删对象；对象删除失败不影响元数据删除）。
- **前端上传弹窗**（src/app/sop/page.tsx UploadModal）：「在线链接 / 本地文件」互斥切换；文件模式拖拽+点击、展示文件名/大小、前端按扩展名+大小预校验（服务端兜底）、隐藏链接输入框与手动要点；提交用 FormData。SOP 卡片来源标签 SOURCE_LABEL 增 `file: 本地上传`。
- **上传弹窗增强（批量+防误关+草稿，本轮）**：UploadModal 改为受控组件，草稿持有于父级 `uploadDraft` 状态（SopUploadFileItem[] 内存句柄）→同页面会话关闭/重开时 File 完整保留。多文件：`<input multiple>`+拖拽均**追加**（不替换），按 name+size+lastModified 去重，单次上限 20，逐项校验（文档≤30MB/图片≤10MB），文件列表含缩略图（FileThumb 组件管理 createObjectURL 生命周期）/逐项可编辑标题；单文件保留顶部标题框（默认=去扩展名），多文件隐藏顶部标题改为逐项标题。提交逐文件并发（CONCURRENCY=3）复用 POST multipart，有整体进度 n/总数、单项状态（等待/上传中/成功/失败），失败不中断、可整体再次提交仅补发未成功项；全部成功才 onCreated（清草稿+关弹窗+刷列表）。弹窗**仅主动关闭**：遮罩与 Esc 均不关闭（keydown capture 拦截），右上角 X + 底部“取消”为主动关闭；有内容（文件或标题/备注等改动）关闭时二次确认（“继续编辑/仍要关闭”），已保存草稿→保留、未保存→清空。底部按钮：取消 | 保存 | 确认上传；保存仅持久化**序列化元数据**到 localStorage（key `blue_sop_upload_draft`，File 无法序列化故刷新后丢失）、同页面会话内存句柄保留完整恢复；刷新后重开恢复文字字段+文件清单并标“需重新选择”、补齐前“确认上传”置灰；“放弃草稿”清本机+内存（文件不落库无孤儿）。本轮“保存”仅本机浏览器暂存，非跨设备正式草稿。
- **文档页文件展示**（SopDocDetailBody）：图片内联 `<img>`（签名 URL，点击放大预览，SVG 不内联仅下载）；PDF 内嵌 iframe + content_body 文本（details 折叠「展示提取文本」）；Word/PPT/txt/md 内联 content_body；无文本/无法预览显示友好降级文案。顶部唯一入口=文件类显示「下载原文件」，链接类维持「查看原文」。保持"顶部唯一外链、底部无大按钮"红线。
- **自动摘要联动**：in-repo 提炼入口即 runSopRefine（覆盖 source_type='file' 且 content_body 非空）。`codeact/scripts/sop_auto_summary.py` 为外部定时任务、不在本仓库；如外部脚本需覆盖文件类选取，改外部 codeact 并重新注册（不改本仓库 Calendar/每日任务）。BLUEAI_API_KEY 缺失→ai_status=failed，不编造。
- **验收口径**：每类文件上传=对象落桶+落库+content_body 有文本（图片除外）；非法类型/超限无残留对象；非 PM/运营上传与删除 403；签名 URL 仅可见用户可取；老 doc/抽文本失败优雅降级不报错；测完恢复 dev 库原状（当前基线：sop_documents=4 真实、sop_categories=14、users=1、sop_read_logs=0）。

## SOP管理板块（v2.10：图片上传自动转 PDF 展示）
- **sop_documents 新增列**（db upgrade 增量）：`original_file_url` text（JSON 数组=原图对象 keys）、`original_mime_type` text（JSON 数组=原图 mimes，与 keys 一一对应）。
- **转换范围（如实限缩）**：仅 `jpg/jpeg/png` 用 `pdf-lib` 转 PDF（`src/lib/img-to-pdf.ts`：`PDF_EMBED_EXTS`、`isEmbeddableImageExt(ext)`、`buildImagesPdf(images)`，embedPng/embedJpg，页面尺寸=像素×0.75pt（72dpi）铺满不留白）。**不引入 sharp**，故 gif/webp/bmp/svg 不解码，仍走原图内联展示（不转 PDF、不报错）。
- **合并模式**：前端勾选「合并为一个 PDF」→ 单次 FormData 提交多个 file + `merge_images=true`。route.ts `handleFileUpload`：`form.getAll('file')` 多文件；可转图片集合→`buildImagesPdf` 合成**一个多页 PDF（页面顺序=提交顺序）→ 仅 1 条记录**；merge 分支里**不可转文件（others）各自独立落库**（本轮修复点：不能只处理 convertible 丢弃 others）。
- **单图/非合并**：每张可转图片各自生成**单页 PDF**→各 1 条记录（原图保留）。
- **落库要点**：图片转 PDF 时 `file_kind='pdf'`、`mime_type='application/pdf'`、`file_name=标题/去扩展名+'.pdf'`、`file_size=生成 PDF 字节`、`content_body=null`（图片无文字层，不 OCR）、**跳过 runSopRefine（无 AI 摘要）**、`ai_status='pending'`；`original_file_url/original_mime_type=JSON.stringify(keys/mimes 数组)`。非图片文件维持 v2.9 行为（写 content_body 抽取文本并如常触发 refine）。`src/app/api/sop/documents/route.ts` 内 `createFileRecord(p, baseTitle, {titleFallback})` 复用处；失败用 `writtenKeys`/`trackWrite` 统一清理已写对象。
- **详情 GET**（`[id]/route.ts`）：返回 original_file_url/original_mime_type/original_signed_urls（逐 original key 签发签名 URL，对象形如 `{url, mime}`）；PDF 的 file_signed_url 仍签发。
- **文档页展示**（SopDocDetailBody）：file_kind='pdf' 时顶部 chip 文案改「下载 PDF」并内嵌/下载该 PDF；`hasOriginals` 时显示次级「查看原图」链接（多个显示数量），点击打开首张原图签名 URL。
- **删除联动**：DELETE 先 select 取 file_url + original_file_url，解析 JSON 数组→`deleteSopFile` 逐个清 PDF 与全部原图对象（对象删除失败不影响元数据删除）+ 级联删 sop_read_logs；非 PM/运营 403。实测删除后 PDF 与全部原图对象均 "Object not found"（无残留）。
- **验收口径（实测通过）**：单张 jpg/png→单页 PDF 且 PDF 字节以 `%PDF` 开头、原图 bytes 与原文件一致；gif 保留原图不转 PDF；多图合并→1 条多页 PDF 记录+2 原图顺序=提交序；非合并 2 图→2 条记录；混合(png+jpg+gif)合并→1 条图片 PDF + 1 条 gif；content_body=null 且 ai_status 非 done；非 PM 上传/删除 403；删除后无残留对象。测完恢复 dev 库原状（基准同上）。

## SOP管理板块（v2.11：图片 PDF 平台展示优化——不 OCR/不动 AI 区块）
- **铁律**：`file_kind=pdf` 详情页只由 PDF 阅读器（`<iframe>` 渲染 `file_signed_url`）展示，任何情况不得退回 `<img>` 原图画廊（图片仍只在 `file_kind=image` 走 img）。
- **`SopDocDetailBody.tsx` 新增 `PdfViewer` 子组件**：加载骨架「PDF 加载中…」；url 空 / iframe onError / 25s 超时 → 明确兜底（原因文案 + 「重新加载」 + 「下载 PDF」），不白屏不静默。「重新加载」调父级 `onRefreshDoc`（doc/[id]/page.tsx 的 `refreshDoc` 静默重拉详情刷新签名 URL，不整页闪 loading）；父级无回调则 `window.location.reload()`。iframe 高度 `clamp(440px, 62vh, 780px)` 自适应，dark/light 边框/背景用 var。
- **顶部信息**：图片生成的 PDF 显示 `PDF · N页 · 由 N 张图片生成`（N=original_signed_urls 长度，回退解析 original_file_url JSON）；「查看原图(N张)」保留次要小入口（打开首张原图）。未改动「AI 提炼」「内容摘录」区块结构，未改签名时长/桶策略。
- **验收口径（实测通过）**：jpg/png 页贴合无白边、多图合并页序=提交序、PDF 头 `%PDF` 可读；SSR 渲染组件验证 pdf→iframe 且无 `<img>`、空 url→「PDF 暂无法在线预览/重新加载」兜底、file_kind=image 仍 img；非合并单图→单页 PDF；非 PM 上传/删除 403；删除后对象无残留；ts-check/lint(改动文件无新增告警)/生产 build 全绿。测完恢复 dev 库原状（当前 dev 真实记录=sop_documents 5：4 条 manual/feishu + 1 条 file/pdf「【产品】X500产品资料」[工单背景的真实合并 PDF]，sop-files 桶 4 对象=该 X500 的 pdf+3 原图）。

## SOP管理板块（v2.12：移除详情页独立「AI 提炼」框，仅保留内容摘要区）
- 仅改 `SopDocDetailBody.tsx` 前端：整段删除「✨ AI 提炼」边框框（done/processing/暂不可用的三态 JSX 全删）；只保留「内容摘要」区（读 content_excerpt）。
- 空态文案改为全来源通用的中性提示：`暂无内容摘要。图片/文档的内容识别能力接入后将自动生成。`（不再写"若来源为飞书文档…"等单一来源措辞）。
- 清理因删框而不再使用的接口字段：`ai_summary`、`ai_keypoints`、`ai_error` 从 `SopDetailDoc` 移除；**保留 `ai_status`**（顶部状态徽章"资料待补充/已提炼"仍用，勿动）。未改 PdfViewer、「PDF · N页 · 由N张图片生成」、查看原图、上传逻辑与后端。
- 验收口径（实测通过）：SSR 渲染组件验证「AI 提炼」出现 0 次、摘要区计数=1、有 content_excerpt 正常显示、无 excerpt 的图片/PDF 文档显示新中性空态、iframe「下载 PDF」/「PDF · N页」信息横向无回归；ts-check / lint（改动文件 0 告警）/ 生产 build 全绿；无需造数据，dev 库原状未动（同 v2.11）。

## SOP管理板块（v2.13：详情页 PDF 简洁展示——关闭左侧导航窗格 + 竖版按宽铺满）
- 仅改 `SopDocDetailBody.tsx` 前端 PdfViewer：新增本地 helper `withPdfViewerParams(url)`，在签名 URL 后追加 PDFium 展示 fragment（`#navpanes=0&view=FitH`：关闭左侧导航/大纲窗格 + 竖版页按宽度适配横向铺满、消除左右大块留白）。fragment 不参与签名、不影响签名 URL 鉴权；原址已有 fragment 则先用 `URLSearchParams` 解析后 `set` 覆盖同名参数再拼接，无则直接追加。iframe `src={viewerSrc}`（`const viewerSrc = withPdfViewerParams(url)`），下载/重新加载按钮仍用原始 `url`（不带 fragment）。
- **参数选定依据（浏览器实测，非拍脑袋）**：用 playwright-core + 缓存 Chromium（`/root/.cache/ms-playwright/chromium-*`）`page.setContent('<iframe src=签名URL>')` 截图 + PIL 像素分析（bright=页面空白区>200 luminance、dark=留白/窗格<80）：X500 合并 PDF 页为 841.5pt×5877pt 超长竖版（aspect≈0.14）。实测 `navpanes=0` 移除左导航会话面板（左 dark 96px→≈10 已验证）；`view=FitH` 与 `zoom=page-width` 效果等同、页面填充率随容器宽度提升（900 容器 76%→87%，1200→91%，1400→96%）→ 按工单偏好选 `view=FitH`。
- **铁律不变**：`file_kind=pdf` 详情页只能由 PDF 阅读器（iframe 渲染 `file_signed_url`）展示，绝不退回 `<img>` 原图画廊；未改 PdfViewer 的加载骨架/onError/25s 超时兜底/「重新加载」/「下载 PDF」；未动图片论文（`file_kind=image` 仍 img）、上传、后端、`.coze`/`.preview`。
- 验收口径（已过）：ts-check 0 错、lint 改动文件 0 新增告警（仅继承的既有 `<img>` warning 2 条在图片内联展示处）、生产 build 全绿、test_run pipeline（lint/ts-check/service_probe=localhost:5000 ready）pass；dev server 重启后监听 5000。dev 库原状未动。

## SOP管理板块（v2.14：本地表格上传 xlsx/xls/csv + 服务端解析 + 详情页表格化展示）
- **类型与存储**：`src/lib/file-extract.ts` EXT_MAP 新增 xlsx/xls/csv → `kind:'sheet'`（mime=xlsx 全名/ms-excel/text/csv）。魔数：xlsx=PK、xls=D0 CF 或含 'Microsoft Excel'、csv 从宽（纯文本，交解析器判编码）。sop_documents 新增列 `content_sheet` text（JSON 字符串：sheets[]，结构化表格供详情展示）；原始文件照常入桶 sop-files + `file_signed_url` 签名可下载。
- **服务端解析（新文件 `src/lib/sheet-parse.ts`，只在服务端调、防不可信文件）**：`parseSheetFile(kind, buffer, ext)` 用既有依赖 `xlsx`（SheetJS）解析。多 sheet（≤20 个）逐个 sheet 按「表头 + 行」结构化为 `{name, header, rows, totalRows, shown, truncated}`；单元格裁剪/空值置 ''；列≤50、每 sheet 展示前 200 行并标注「共 N 行，展示/提取前 M 行」。CSV 编码兼容：`decodeCsvBuffer` 优先 UTF-8（TextDecoder fatal 校验），非法则回退 GBK（再 latin1 兜底），剥 BOM。产出 `sheets[]`（content_sheet JSON）与纯文本 `text`（content_body，多 sheet 分节、供列表检索 + AI 摘要）。
- **上传/检索**：`src/app/api/sop/documents/route.ts` createFileRecord 中 kind='sheet' 走 parseSheetFile（不走 extractFileText），写 content_sheet + content_body；非空 contentBody 照常 `runSopRefine`（表格参与自动摘要）。**列表搜索扩展**：原来仅 `title/ai_summary` ilike，现加 `content_body.ilike` → 表格单元格文本可直接搜到（对 AI 摘要失败/未提炼的文档同样可命中）。
- **详情页表格化展示**（SopDocDetailBody）：file_kind='sheet' 且有 content_sheet → `SheetTablePanel`（新子组件）：head `text-[13px]` 表格、表头`--sop-soft`底+`--sop-t1`、斑马纹（奇行 `--sop-soft`）、列 whitespace-nowrap + 横向滚动（minWidth=col×80px）、容器 maxHeight 480px 纵向滚动；多 sheet 渲染「页签」（激活=--sop-primary 白字），页签上标 trunk；行数超限底部灰字提示「共 N 行，展示前 M 行」。沿用 `var(--sop-*)` 双主题（新增 `--sop-soft` 到 sop-theme.css 光/暗两套）。顶部 chip 仍显「下载原文件」。
- **回归**：image/pdf/word/ppt/txt/md 上传、PdfViewer、摘要区、状态徽章、查看原图均不动；在线链接（飞书/腾讯）路径未改（表格不阻断）。
- **验收（实测）**：多 sheet xlsx（产品价目/渠道分布）与 UTF-8 csv（人员名单）真实上传成功：不再提示类型不支持、file_kind=sheet、mime 正确、content_body 分节文本、content_sheet 结构化 sheets、file_signed_url 可下载；列表搜单元格关键词（xlsx→'2999'、csv→'杭州'）命中；SSR 渲染：sheet→1 表+2 页签+0 img、pdf→iframe、image→img、截断提示正确；ts-check 0 错 / lint 改动文件 0 新增告警 / 生产 build 全绿 / test_run（lint/ts-check/service_probe）pass。测试数据已清理，dev 库恢复基线 5 条、content_sheet 全空。AI 提炼：preview 密钥未注入 → ai_status=failed（照旧不造假）。

## SOP管理板块（第一期：制度+培训文档库 查阅/检索/权限）
- 库：sop_documents（制度/培训统一表：doc_type=management|training、category、applicable_post/applicable_brand 为 jsonb 数组、visibility=internal|general、needs_quiz、status、version）与字典表 sop_categories（type=category/post/brand、label、sort_order）。
- 页面：`/sop`（文档库：全部/制度/培训分页签 + category/brand 下拉 + 关键词，卡片显示 标题/分类/品牌/来源状态/需考核；来源有 external_url 显示"查看文档"，无则"资料待补充"）、`/sop/doc/[id]` 详情页（全字段；external_url 新标签打开，无则占位）。
- API：`/api/sop/documents`（GET，支持 doc_type/category/brand/keyword）、`/api/sop/documents/[id]`、`/api/sop/categories`。均只读。
- 权限：复用 `src/lib/api-permission.ts` 的 `isExternalRoleRequest`；内部角色可见全部 published；「外部合作」仅 visibility=general（本期 17 条全 internal，故外部为空态/详情 404）。**未改动既有总闸 maskExternalBusiness**，SOP 门控直接在路由内做。
- 避坑：jsonb 数组列（applicable_brand）不能直接用 supabase-js `.contains([x])`（会序列化成 `{..}` 文本数组字面量，PostgREST 报 invalid input syntax for type json）；应在 DB 查完其他条件后，内存中 `applicable_brand.includes(brand)` 过滤（数据量小）。
- 数据：17 条已入库（制度4 management=日常管理类，培训13；needs_quiz=6；external_url 有值 2 条：南京字节 oceanengine、vivo直播违规注意事项 feishu——验收写"3条"与实际源数据不符，按源数据 2 条为准）。

## SOP管理板块（v2.15：在线文档正文 Markdown 完整渲染 + 特殊标签 + 安全过滤）
- **新增依赖**：`react-markdown`+`remark-gfm`+`rehype-raw`+`rehype-sanitize`（已在 SopDocDetailBody 内 bundle）。
- **渲染分支**：在线来源（`source_type !== 'file'` 且 `content_body` 非空，即飞书/腾讯/人工等）→ `MarkdownContent` 完整渲染 markdown（标题/列表/表格/引用/加粗/链接，remark-gfm 支持 GFM 表格、任务列表、删除线）；**本地文件分支保持不变**（`isFile` 与 sheet/pdf/image 分支/sheet 表控/旧 text 展示都未动）。空 content_body 维持原兜底文案「原文内容暂无法直接展示…」。
- **飞书特殊标签**：`<callout emoji>`→`.sop-callout` 高亮块（emoji+body，支持内部含 `<p>` 等）；`<sheet …/>`→`.sop-sheet-hint` 占位提示；`<title>`→组件返回 null 不重复展示标题；未知 HTML 标签（如 `<cite>`）被 rehype-sanitize 降级为纯文本。均用 `rehype-raw` 解析 + `rehype-sanitize` 清洗（schema 在 `defaultSchema` 基础上放宽 callout/sheet/title/br/del/sub/sup/mark 及必要属性）。
- **安全红线**：rehype-sanitize 默认协议过滤已挡 `javascript:`；另自定义 `a` 组件二次校验 href（仅 http(s)/mailto:/tel 渲染链接，其余渲染为纯文本不生成 `<a>`），`target=_blank rel=noopener noreferrer`；禁用 raw HTML 脚本/on* 属性靠 sanitize 兜底。
- **样式**：`.sop-scope .sop-md`（含 h1-h6/li/blockquote/hr/表格 thead+斑马纹/行内及块级 code/链接/img 等）与 `.sop-callout`/`.sop-sheet-hint` 全部用 `var(--sop-*)` 双主题；模块增强 `declare module 'react'` 仅注册 `callout`/`sheet` 自定义元素（**勿 augment `title`**——它是原生 HTMLTitleElement 既有 IntrinsicElements，直接在 components.title 提供 () => null 即可）。
- **验收（实测）**：SSR 渲染合成 markdown 全绿（h2/table-wrap/blockquote/bold、callout emoji、sheet hint、title 去除、javascript: 链接被过滤为 span、安全链接 _blank）；对真实飞书正文（`a59e7003`，脚本抓回 150k 字符含 `<title>`/`<callout emoji="📌">` 嵌套 `<p>`/含 `<cite>`/markdown 表格）通过 API 取回 + SSR 渲染通过（title 去重、callout/表格渲染、`<cite>` 降级为文本、无 javascript:）；在线空 content_body 兜底不变；sheet/pdf/image 分支无回归；ts-check/lint(仅继承 img 告警)/生产 build(58/58)/test_run pass。
- **dev server 注意事项**：`pnpm run dev` 走 `scripts/dev.sh`→`tsx watch src/server.ts`（**进程 cmdline 是 `cli.mjs watch src/server.ts`，不是 "next dev"**）；kill 残留时用 `pkill -9 -f "cli.mjs watch"` + `webpack-loaders`/`src/server.ts`，勿碰 9000。测试飞书正文用 fetch-on-detail 或临时 UPDATE 后回填 NULL（勿污染 dev 库）。

## SOP管理板块（v2.16：在线文档『文档级授权 + 自动重试』闭环）
- **目标**：在线飞书文档（source_type='feishu'）详情页正文展示从「仅 bot 只读」升级为「bot-first → 提交人 user 身份回退 → 一键授权平台只读 → bot 重试」闭环；仍读不到时明确标「待授权」并给出 owner 申请指引。不破坏 v2.15 正文直出 与 sheet/pdf/image。
- **DB 增量列**（sop_documents，已加）：`perm_status text`（null/pending/granted）、`perm_source text`、`perm_at timestamptz`、`fetch_as text`（bot/user）、`fetch_error text`。
- **抓取（`src/lib/sop-ai.ts`）**：`fetchFeishuDoc(url, userToken?)` 返回判别联合 `FeishuFetchResult`（`{ok:true; content; readAs}` | `{ok:false; kind:'permission'|'notfound'|'empty'|'parse'|'other'; message}`），bot-first 失败自动用 userToken 回退；`classifyFeishuFailure`/`fetchFeishuWithToken` internal。保留 `fetchFeishuDocBody(url)`（bot-only string）供 sop-refine 兼容。**join 收窄陷阱**：`FeishuFetchResult` 为字面量判别联合，只能用 `if (fr.ok)` 判等收窄，不能用 `fr.ok && fr.content` 真值判断（content 可为空串，TS 无法收窄）。
- **权限/授权（新增 `src/lib/feishu-perm.ts`）**：全部凭据只读 env、永不硬编码/日志。`getFeishuUserToken(phone)`（读 `FEISHU_USER_TOKENS` env：JSON 对象 phone→user_access_token）、`resolveFeishuUserToken(phones[])`、`getFeishuPlatformMember()`（读 `FEISHU_PLATFORM_MEMBER` env：平台 app 的 owner/member 身份，授权时用）、`sanitizeFeishuMsg`、`feishuReq`、`resolveDocumentToken`（wiki 链接→`wiki/v2/spaces/get_node` 解析 obj_token/docx token）、`authorizePlatformForDoc(url, userToken)`（`POST /drive/v1/permissions/{token}/collaborators?type=docx` 加平台成员 `perm:'view'`，单篇、最小 scope）、`isAlreadyMember`（列出协作者判已在）。
- **详情 GET（`[id]/route.ts`）**：select 带 perm/fetch 列；用 `fetchFeishuDoc` + `resolveFeishuUserToken([ctx.phone, submitterPhone])`（`resolveSubmitterPhone` 按 uploaded_by→users.phone）代替 bot-only fetch；持久化 `fetch_as`/`fetch_error`/`perm_status`；计算 `canGrant`（提交人或 PM/超管）与 `feishuEnabled` 注入响应。
- **接口**：`POST /api/sop/feishu/grant`（仅提交人/PM/超管，否则 403；resolve user token + platform member 缺失 → `409 NEED_CREDENTIALS`；真实授权后设 perm_status='granted'/perm_source/perm_at，再 bot 重试拉正文）；`POST /api/sop/feishu/retry`（bot-first 抓，成功→写 content_body/fetch_as/perm_status=ok，权限失败→perm_status='pending'/fetch_error）。
- **前端（`SopDocDetailBody.tsx`）**：`FeishuPermPanel` 子组件——`perm_status='pending'` 显示「待授权」chip +（canGrant）「✓ 授权平台读取此文档」按钮 +「↻ 重新检查」（调 onRecheckFeishu）；owner 非提交人时显示向 owner 申请的可复制话术（加平台协作者/组织内链接可读）+ 复制按钮；granted 仍没正文时给「组织内链接分享」提示。`SopDetailDoc` 增 perm/fetch/canGrant/feishuEnabled 字段；page.tsx 增 `grantFeishu`/`recheckFeishu`（POST 后刷新详情）。
- **安全红线**：token 只从 env 读、永不日志；授权 scope 仅单文档只读 `perm:'view'`；非提交人/PM/超管授权 403；凭据缺失返回 409 而非伪造成功。
- **验收（实测）**：SSR probe 覆盖 待授权/已授权/grant 按钮/owner 申请话术/复制/重新检查/link-share + v2.15 markdown/sheet/pdf/image 无回归；live: retry d4f456c2 → `readable:false, perm_status:'pending', fetch_error:'...node permission denied, tenant needs read permission.'`；grant（本次 preview env 未配 FEISHU_USER_TOKENS/FEISHU_PLATFORM_MEMBER）→ `409 NEED_CREDENTIALS`（诚实，不伪造）；中控 grant → 403；detail GET 返回 perm_status='pending'/canGrant/feishuEnabled。**preview env 凭据限制**：真实一键授权全闭环需部署时注入 `FEISHU_USER_TOKENS`（phone→user token JSON）+ `FEISHU_PLATFORM_MEMBER`，缺失时 grant 必然 409。
- **dev 库基线**：sop_documents 恢复 d4f456c2（content_body=NULL/perm/fetch 全 NULL）；外部后台抓取脚本会自行回填部分飞书正文（a59e7003 150k、9d7faf30 等），非本仓库产物、勿回滚。

## SOP管理板块（v2.17：正文链接稳定可点 + callout 改 blockquote 高亮块 + 排版优化）
- **仅前端**（`SopDocDetailBody.tsx` 的 MarkdownContent + `src/components/sop/sop-theme.css`）；服务端抓取脚本已配套把 callout 改为纯 markdown `>` 引用块、剥离 `<p>`（外部，不在本仓库）。
- **链接可点**：`a` 自定义渲染保持二次校验 href（仅 http/https/mailto/tel 渲染 `<a target=_blank rel=noopener noreferrer>`，其余降级 `<span>`）；`javascript:` 等由 rehype-sanitize + a 组件双保险过滤。`remark-gfm` 自带 literal autolink，裸 URL（`https://…`）也会自动成 `<a>` 经同一过滤。`.sop-md a` 用 `word-break:break-word; overflow-wrap:anywhere` 长 URL 安全换行不撑破。
- **blockquote 高亮块**（`.sop-md blockquote`）：左 4px 强调色竖条 + `--sop-primary-bg` 半透明强调底 + 圆角 `0 8px 8px 0` + `font-style:normal` 去斜体；块内 h1-h4 用 `--sop-t1` 无下边框、ul/ol 缩进、`> :first/last-child` 归零，块内 `a` 仍 `--sop-primary` 保证对比度。双主题自动（沿用 var）。**历史 `<callout>` div 兜底样式 `.sop-callout` 保留未删**。
- **排版**：正文容器 `leading-[1.85]→1.8`；`.sop-md` 根加 `overflow-wrap:anywhere;word-break:normal` 防横向溢出（表格仍 .table-wrap 横向滚动例外）。
- **验收（实测）**：生产 build EXIT=0/60 页/无错；ts-check 0 错、lint 0 新增告警、test_run(lint/ts-check/service_probe) pass；SSR probe 全 PASS——blockquote 渲染+块内链接(md+裸URL 均可点 target=_blank)、普通段落 md 链接、裸 URL autolink、`javascript:` 过滤为 span、块内 h3/ol、历史 callout div 兜底保留。dev server 重启监听 5000。不插数据、不改后端、不动 sheet/pdf/image。

## 百应浏览器登录 Spike（分支 feat/dy-buyin-spike，独立验证，不影响 SOP）
- **目的**：验证后端能否拉起无头 Chromium 打开巨量百应登录页并取回抖音扫码二维码——整条「浏览器登录百应」链路的硬卡点。不采集、不入库。
- **引擎与安装**：`playwright-core@1.51.1`（与缓存 Chromium 精确匹配：`/root/.cache/ms-playwright/chromium-1161`=browser 134.0.6998.35，同有 headless_shell/ffmpeg/firefox）。无需下载浏览器、无需额外系统库（沙箱已具备 nss3/atk/cups/drm/gbm/pango/asound/cairo/xcomposite 等）。launch 需 `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu --disable-blink-features=AutomationControlled --no-zygote` + UA 用 Chrome/134 + zh-CN locale，否则 get_qrcode 可能 ERR_ABORTED。
- **关键链路（实测通过）**：`GET https://buyin.jinritemai.com/mpa/account/login?log_out=1&type=24`(HTTP 200) → 等 `open.douyin.com/qrconnect` iframe（会被页面反复 detach/重挂载，需轮询"连续存在≥1.5s"判稳，≤25s）→ iframe 内找**非 svg 的 raster `<img>`**（class=`qr-image`，refresh 按钮是 `data:image/svg+xml` 需排除，querySelector('img') 会先命中 svg 刷新图标）→ 元素截图。get_qrcode 高频轮询返回 200（令牌会滚动更新）。
- **成果代码**：页面 `/buyin-spike`（client，AppShell+dark/light 复用，独立模块无名权限=可访问）；API `POST/GET /api/buyin-spike/qr`（`runtime=nodejs`+`dynamic=force-dynamic`；返回 `{ok, failedStep, error, image(dataURL), debug{...,timingMs{launch,goto,qr,screenshot}}}`；finally 关 browser 防泄漏；失败各步结构化不 500）。**middleware 保护 /api/**，页面同源带会话可过；curl 直测需 `Authorization: Bearer <signToken({userId,phone,role,name})>`（secret 见 src/lib/auth-token.ts 兜底值；tsx import 该项目模块签名）。
- **实测结论（真实 end-to-end）**：API ok=true；launch≈113ms/goto≈1165ms/qr≈2406ms/screenshot≈1290ms，shotMode=qr-img(13KB)；返回图用 jsQR 解码成功→`https://open.douyin.com/platform/oauth/qr_auth/?...&token=<live>`，即真实可扫描抖音登录二维码。=> **后端可稳定取回百应抖音扫码二维码，卡点解除**。风险提示：环境依赖 /root/.cache 的 chromium-1161（部署/换机需重装 playwright 或注入对应浏览器）；抖音风控（rmc-nocaptcha iframe）可能随机拦截 get_qrcode，需保留重试/兜底。
- **边界**：仅独立页面+API、单分支，不改现有页面/导航/鉴权，不 deploy，不插数据；`package.json` 增加 `playwright-core@1.51.1`（devDependencies 之外，run 需它）。
- **侧边栏入口（本轮，仍属 spike 分支）**：新增主导航「百应数据」→ `/buyin-spike`（图标 `Database`，位于 SOP 管理之后、主播工作台之前）。按正式 module 注册进 ModuleKey/权限体系：`types.ModuleKey` 加了 `'buyin-spike'`，同步 5 处 `Record<ModuleKey>`（constants.MODULE_LABELS/MODULE_PATHS、PATH_TO_MODULE、AppSidebar.MODULE_ICONS/MODULE_PATHS、login.MODULE_PATHS）与 `ROLES[].modules`（全部 5 角色含 provider）、SIDEBAR_ORDER。**ModuleKey 为穷举联合，此后任何新增模块都需同步这 5 处 Record + ROLES**，否则 TS 报缺 key。

## 百应扫码·常驻会话闭环（spike 分支升级：会话轮询 + cookie 提取）
- **会话注册表** `src/lib/buyin-session.ts`：模块级内存 Map（dev 常驻进程有效）。入参会话持 `browser/context/page/状态/时间/cookie/error/timer`。`startSession`（ttl 默认 5min，可用 `BUYIN_SESSION_TTL_MS` 或 `{ttlMs}` 覆盖；开始前关闭已有会话防堆积）、`getSessionStatus`、`cancelSession`、`closeAllSessions`、`liveSessions`、`getSession`（仅供进程内自检）。超时自动 `disposeSession`（清 timer、关 browser、删 map），不泄漏。浏览器启动参数/UA/取码逻辑与 `/api/buyin-spike/qr` 一致。
- **登录判定** `sessionLoginDetected(url)`：不在 douyinec.com、不含 `/login`、含 `buyin.jinritemai.com` 即视为已登录。检测到后 `attemptLoginFinalize`：先开 compass 首页复用登录会话（cookie 覆盖 buyin+compass 两 host），再 `extractCookie`（await，确保首次 logged_in 即带 cookieCount/accountHint）——从 `context.cookies(buyin|compass)` 提取，`accountHint` 用正则 `/(^|_)(uid|user|account|name|nick)(_|$)/i` 匹配 cookie 名取值截 40；**不回显 cookie 明文，只回数量与账号**。
- **API**：`POST/GET /api/buyin-spike/session/{start,status,cancel}`（`nodejs`+`force-dynamic`，走既有 middleware 鉴权）。start 返回 `{ok,sessionId,image,status:'waiting_scan'}`；status 返回 waiting_scan/logged_in(accountHint+cookieCount)/expired/not_found/error，异常不 500。
- **前端 `/buyin-spike`**：start 取码后 `useEffect` 每 2.5s 轮询 status，检测到 logged_in 置成功态（显示识别账号+cookie 数）并停轮询；expired/not_found 提示重新获取；「重新获取」先 cancel 旧会再 start；卸载时 cancel 当前会话+清定时器防泄漏。
- **自检结论（已实测）**：①进程内走查：start→waiting_scan(17KB qr-img)；注入模拟 cookie+导航 buyin 主页→status 翻 **logged_in**、cookieCount=7、accountHint=注入的 `uid` 值；cancel→not_found；TTL1.5s 超时 live 1→0 自动清理；closeAll 后 live=0 无泄漏。②HTTP(bearer PM token)：start 200+QR、status×3 稳定 waiting_scan、cancel→not_found、未鉴权 start=401。③`pnpm run build` 61/61 EXIT=0；ts-check 0 错；lint 改动文件 0 error（仅 1 `<img>` warning）；test_run(lint/ts-check/probe) pass；/buyin-spike、/sop 200。
- **诚实边界**：预览环境无法真扫码，logged_in 用「脚本驱动页面跳转/注入 cookie」验证状态机与 cookie 提取逻辑；真实扫码设置的实际 cookie 名/账号识别字段需用户在真机上实测校准（accountHint 取值可能为 null→界面显示"未知"）。
- **取 cookie 的坑**：cookie 提取必须 await（fire-and-forget 会导致首次 logged_in 时 cookieCount=0 的竞态），已修。

## 百应 M2：采集任务配置（spike 分支第四轮：删调试区 + buyin_tasks 表 + CRUD + 字段/粒度联动）
- **删调试区**：`/buyin-spike/page.tsx` 移除 startDebug/statusLog/sessionId state 与 debug 输出块；登录后渲染 `<TaskConfigPanel loggedIn>`。
- **数据**：`src/lib/data/buyin_fields.json`（81 字段）+ `src/lib/data/buyin-fields.ts`（`BUYIN_FIELDS/BUYIN_GRANULARITIES/BUYIN_CATS/fieldSupported/supportedFields/groupFieldsByCat/GRANULARITY_NOTES`）。字段按 9 类(采购、佣金、趋势、「取消与退款」等)分组；`supportedFields(granularity)` 运行时过滤（hour 排除退款/gpm/曝光/停留时长、anchor 排除 phone_sale_num、product 含 product_list+model_sale_list、natural_sale_amount 只 day）。粒度 hour/day/anchor/product。
- **表** `buyin_tasks`（exec_sql 建 + `src/storage/database/shared/schema.ts` 登记）：id uuid pk、name、brand、granularities text[]、selected_fields jsonb、enabled bool、task_type、created_at/updated_at。鉴权复用 `getSopUserContext(request)`（`src/lib/api-permission.ts`），未登录 401，仅 PM/运营可写（403 其余）。
- **业务钩子** `src/lib/buyin-task-utils.ts` 仅 `cleanTaskBody`（去未知字段/裁剪空值，安全转存）。
- **API**：`/api/buyin-spike/tasks`（GET 列表 / POST 创建）；`/api/buyin-spike/tasks/[id]`（PATCH 更新 / DELETE）。PATCH 必须把 name/granularities/selected_fields 一起并入 update 对象（早期漏带导致改名/粒度回调被丢弃），bug 已修并验证。
- **前端** `src/components/buyin/TaskConfigPanel.tsx`：配置表单（任务名/品牌/粒度/字段分组勾选），字段随粒度联动。各角色模块可见（ModuleKey 已含 buyin-spike）。
- **验证（已实测）**：install/build(61/61 EXIT=0)/ts-check/lint 全绿；HTTP CRUD 全链路（create→200、list 含、空名 400、update 改名+粒度回读成功、toggle-off enabled=false、delete、after 无记录、noauth 401）；字段联动脚本断言通过。**test_run 需 5000 有存活 dev 服务**——手动 `bash ./scripts/dev.sh` 常驻时 lint/ts-check/probe 全 pass、smoke（tasks→401、/buyin-spike→200）。删除可用 `/tmp` 临时 node 脚本 + 前述 bearer token 直打。
- **dev server 注意（沿用）**：pkill `-9 -f "cli.mjs watch"`/`"src/server.ts"`；改完测试 test_run 前务必确保 5000 上有运行中的 dev.sh 实例（service_probe 依赖，否则 app.log 陈旧报 service not ready）。勿碰 9000。

## 百应 M2 补丁（第五轮：账号自动带出 + 频率分钟/小时；仍属 spike 分支，仅 dev）
- **频率六态**（buyin_tasks.frequency）：`minute/hour/daily/weekly/custom/manual`。新列 `interval_value integer`（间隔数值：minute=分钟 / hour=小时 / custom=天）+ `weekday integer default 1`（weekly 周几）。`interval_days` 保留作为 custom 天数的兼容读写（保存时 interval_value 与 interval_days 同写，旧 reader 仍可读）。
- **间隔校验（前后端双拦）**：minute 整数且 ≥5（默认 15，提示「高频可能触发百应风控 11001；分钟级为轮询刷新」）；hour 1-23（默认 1）；custom ≥1（默认 7）。daily/weekly/manual 无间隔（interval_value=null）。非法在 `cleanTaskBody`(src/lib/buyin-task-utils.ts) 推 errs→400，前端 save() 同步拦截。
- **时刻/星期显隐**：「获取时间（时刻）」仅 daily/weekly 显示（minute/hour 隐藏并标注不适用）；weekly 额外显示「每周几」下拉（默认周一，weekday 1-7）。
- **账号/达人自动带出**：`/buyin-spike/page.tsx` 登录后把 status 的 `accountHint` 传入 `<TaskConfigPanel loggedIn accountHint>`；面板内 useEffect 在登录/重登切换账号时把 by_account 预填为当前会话账号标识（cookie 名值，回显明文账号名/id 或 hash——均不回传明文 cookie，只回 accountHint 短标识），用户手填可覆盖、留空=采集当前登录账号，并渲染「当前登录账号已自动带出：X」说明。lastAutoAccountRef 记录上次自动值：账号值=上次自动值或空时才覆盖，避免覆盖用户手填。
- **验证（已实测）**：build(61/61 EXIT=0)/ts-check/lint(改动文件 0 error)全绿；HTTP CRUD：minute(15)/hour(3+weekday5)/custom(7)/daily(run_time)/weekly(weekday2) 各自 200 且回显正确（interval_value+interval_days 兼容回写）；minute=2→400「分钟级间隔至少 5 分钟」、hour=0→400、hour=24→400；PATCH 改 hour=10+改名成功；list 显示各频率文案；noauth 401。SSR 渲染面板：频率选项=6、登录+accountHint 渲染自动带出说明、未登录不显示。dev 库已清空测试记录（buyin_tasks=0）。test_run 全绿（tasks→401、/buyin-spike→200、/sop→200）。

## 百应 M3：调度器自动执行 + 取数逻辑迁移（spike 分支第六轮，仅 dev）
- **环境勘察（实测，决定选型）**：①python3 3.12.3 / node v24.21.0 可用；②jsdom 不可 require（全局 NODE_PATH 未注入）；③child_process spawn 可用；④持久可写目录 `/workspace/projects/data`（overlay，~9GB）；⑤常驻 worker=src/server.ts 单进程（`tsx watch` 起，cmdline 是 `cli.mjs watch src/server.ts`）；⑥M1 cookie 存进程内存 `Map<sessionId,BuyinSession>`（TTL 5min，只在 buyin-session.ts 按 sessionId 存，**不按 account_hint 存档**；`liveCookies()` 只回显 `{accountHint,cookie}` 数组供进程内 runner 用）。取数签名 SDK `scripts/by_sign/vendor/*.js`（官方 a_bogus）**不在本分支仓库** → 落**方案A(受限)**：进程内 worker+Supabase 存储，能力门控诚实记录，绝不伪造行数。
- **新表 `buyin_run_logs`**（exec_sql 建 + schema.ts 登记 pgTable buyinRunLogs）：id uuid pk、task_id、account_hint、trigger_type(auto/manual)、stat_dates jsonb、granularities jsonb、status(running/success/partial/failed/skipped)、row_count、request_count、error_summary、detail、started_at、finished_at、creator_id。**cookie/签名原文绝不入库、不落日志**（account_hint 只存 task.by_account 前 128 字符）。
- **执行器 `src/lib/buyin-runner.ts`**：`computeStatDates({lookbackDays,statDate})`（默认 [今日-n,今日-1] 含昨日；手动可传单日 statDate）。`runTask` 流程：防重入(`running` Set)→skipped；`skipIfSuccess`+已有 success→skipped；否则插 running 行→`resolveExecutableCookie`(liveCookies 按 account_hint 前缀匹配，无则回退首个) →能力门控：无 cookie→failed「无可用登录态…扫码登录后再执行」/ 无 SDK→failed「取数签名SDK未随仓库就绪…未发起任何真实取数请求」→ finalize 更新 run_logs。真实逐日采集（含 11001 退避重试 1 次、a_bogus 现签不缓存）是**未接入的真实取数入口**，SDK+登录态齐备后在此接入。
- **调度器 `src/lib/buyin-scheduler.ts`**：`computeNextRun(task,after)` 纯函数——minute(+iv·60s)/hour(+iv·3600s)/daily(当日 run_time 已过则次日)/weekly(weekday 1-7，当日已过则下周期)/custom(+interval 天)/manual→null。`BuyinScheduler` 进程内 poll(30s)，只处理 `enabled=true`；同统计日已有 success→skipped（高频轮询不重复刷）；防重入。`src/server.ts` 在 `if (dev) startBuyinScheduler()` 启动（生产默认不跑调度）。
- **API**：`GET /api/buyin-spike/tasks/[id]/runs`（SAFE_SELECT 不含 cookie，isExternal→403）；`POST /api/buyin-spike/tasks/[id]/run`（手动，401 未登录 / 403 非 PM/运营 / 404 无任务；body 可选 statDate 单日，regex 校验；返回 run outcome）。鉴权复用 `getSopUserContext`。
- **前端 `TaskConfigPanel.tsx`**：每个已保存任务卡新增「立即执行」（绑真实 POST /run）+「运行记录(N)」展开（时间/触发 auto-manual/状态/行数/请求数/失败摘要）。已保存任务且有 editingId 时直接执行该任务，「编辑打开」提示指向当前卡。
- **验证（已实测）**：ts-check 0 错；lint 改动文件 0；生产 build 61/61 EXIT=0。新建表增减列用 exec_sql + schema.ts 双维护。测试用手工节点签名 JWT（`src/lib/auth-token.ts` 兜底 secret，HS256，payload {userId,phone,role,name}，`Authorization: Bearer`）。
- **M3 测试结果**：401(无 token)·403(外部合作/主播)·200(PM) 实测；单日 statDate 与默认窗口([今日-1])均 record 真实 failed（原因「无可用登录态」，row 0/req 0）；GET runs 回列表且不含敏感字段；computeNextRun 6 态 12 用例全 PASS；**真实端到端取数本环境不可行**（无扫码登录态 + a_bogus SDK 未迁入）→ 如实报卡点、不编行数。测试临时任务与 run_logs 已清空（dev 库 buyin_tasks=0、buyin_run_logs=0）。
- **test_run 环境注意（M3）**：本环境 `test_run` 的 service_probe 对 pipeline 自行启动的 dev 实例持续报 "service not ready"（app.log 反复回放陈旧 11:59:45 的 file-extract 假 module-not-found）；但手动 `bash scripts/dev.sh` 起服务后 / 与 /api/sop/documents 均 200/401 正常，说明是 pipeline 端口/实例 readiness 环境问题，非代码缺陷。交付走查以手动 dev.sh 实例 + curl 各路由为准。

## 百应 M3 补单：运行时资产 + 登录态持久化 + 真实取数（spike 分支第七轮，仅 dev）
- **运行时资产落址** `/workspace/projects/data/dy_by/dy_by`（skill `dy_by/` 解压于此，持久盘）：`scripts/`（dy_by_run.py/dy_by_info.py/dy_by_common.py/dy_by_sign.py/dy_by_live_*.py/dy_by_product.py/dy_by_login.py/check_env.py）、`scripts/by_sign/pure-by-abogus.js` + `vendor/`（12 个 js 官方 SDK，**禁止修改**）。运行时执行资产，不被 webpack 打包，后端 worker 以子进程调用。
- **私有依赖**（不自带安全、可复现）：python→`/workspace/projects/data/dy_by/pylibs`（`pip install -t` requests/pandas/openpyxl，25 模块，自检 import OK）；jsdom→`/workspace/projects/data/dy_by/node_modules_root/node_modules`（`npm install jsdom@24`，`NODE_PATH` 指向该目录即可 require('jsdom')）。技能 `dy_by_sign.py` 从 os.environ 取 `NODE_PATH` 透传给 node 签名器（`/compass_api/author/**` 才签，全天每请求现签不缓存）。
- **登录态持久化** `src/lib/buyin-cookie-store.ts`：`persistAccountCookies(cookies, hint)` 落盘到 `/workspace/projects/data/dy_by/secrets/by_cookies_<accountKey>.json`（结构 `{platform,update_time,account_key,account_hint,cookies}`，chmod 600）；`accountKeyFor`=sha1(hint) 前 12 hex（回报/文件名只见 key 不见 cookie）。`resolveCookieFileForAccount`（精确 key→hint 前缀→单实例兜底）、`loadPersistedCookies`、`listPersistedAccounts`。**纪律**：cookie 不提前端可访问目录/不入库/不入 git/不进日志或接口；回报只给 account_key。
- **登录即持久化**：`buyin-session.ts` 的 `attemptLoginFinalize` 在 extractCookie 成功后调用 persistAccountCookies（覆盖更新 update_time）；内存会话仍供扫码当交互，但**调度执行一律以持久文件为准**（不依赖 5 分钟 TTL 内存态）。
- **执行器真实取数** `src/lib/buyin-runner.ts`：`resolveExecutableCookie` 先取持久文件，无则用 liveCookies 兜底并顺手落盘；`validateCookieCompleteness` 校验 `cookies.sessionid` + `ecom_us_lt_buyin` + `ecom_us_lt_compass`（缺→failed「需重新扫码」，不半套发请求）；`signSdkReady` 校验 vendor 存在。`runFetchProcess` spawn `python3 scripts/dy_by_run.py --start-date/--end-date/--data-types/--cookie-file [--with-product-detail --by-account --by-kol-id]`，cwd=dy_by 目录，env 注入 `PYTHONPATH=pylibs`+`NODE_PATH=node_modules`（串行单进程、逐日，风控铁律由 skill 保证）；解析 stdout 的 `DATA_DIR/RAW_DIR/PARSE_FILES/ROWS/EXCEL_FILE/FAILS`，`request_count`=RAW_DIR 下 json 递归计数（真实），`row_count`=ROWS。status：rows>0 且无 fails→success；有 fails 且有行→partial；否则 failed。anchor 粒度未注入 shifts→skill 不出主播行，如实附注「需排班」。失败信息经 sanitizeError 脱敏（cookie/sig 打 <redacted>）。
- **端到端前提**：真实取数需一次**新鲜扫码**（用户用抖音 App 扫 /buyin-spike 二维码），登录成功即持久化 cookie；此后调度/手动 run 才有登录态可载入，否则 failed「无可用登录态…请重新扫码」。无扫码前不得把 run 报成成功。
- **compass 登录态补全（修复单）**：早期 finalize 只采 buyin（`context.cookies(COOKIE_HOSTS)` 一次、wait 仅 1.5s），compass 域 cookie（`ecom_us_lt_compass`/`ucas_c0_compass`/`LUOPAN_DT`）未写齐 → 持久文件缺 compass，执行器门控 `validateCookieCompleteness` 判「缺 ecom_us_lt_compass」failed。修法：`ensureCompassCookies(session)` 在登录成功后同上下文导航 `https://compass.jinritemai.com/`（buyin 已登录→compass 自动 SSO 复用同 sessionid 免二次扫码），轮询 ≤20s 等待出现 `ecom_us_lt_compass/ucas_c0_compass/LUOPAN_DT` 任一；`extractCookie` 改为 buyin+compass 两域分别读取并**buyin 在前、compass 在后**合并（同名以 compass 为准，对齐 skill `cookies.update(compass_cookies)`），再持久化。COOKIE_HOSTS 常量已删。**现有已登录但缺 compass 的账号，因无头浏览器会话已回收、从持久 cookie 重建新浏览器无法触发 compass SSO → 只能重扫一次**（新流程一次取齐两套）。验证：ts-check/lint 0、build 61/61、POST run 401/403 正常、PM run 现返「持久登录态不完整（缺 ecom_us_lt_compass）」在门控良性 failed（未发请求）。
- **验证（已实测）**：ts-check 0 错；lint 改动文件 0；生产 build 61/61 EXIT=0；store 单测 persist/resolve/load 通过（临时假 cookie 已删）；`--make-dirs-only` 自建 data 目录通过；/api/buyin-spike/session/start POST 返回 ok=true+waiting_scan+QR（scan 链路可用）；全模块 / /buyin-spike /sop /schedule /data-overview /cost /workstation 200。**真实 day 端到端待用户扫码后执行**。

## 排班页统计卡片「数值空白」修复（src/app/schedule/page.tsx，仅 dev）
- **根因**：排班 6 张统计卡片（覆盖天数/排班人次/总时长/常规时长/凌晨班时长/双播时长）数值 `<span>` 硬编码 `text-white`。浅色主题下 `--card` 为纯白（globals `. :root --card: oklch(1 0 0)`），白字白底不可见 → 用户看到「只有单位、数值空白」；深色 theme 数值可见（这就是为什么看似"两主题都可复现"实为浅色确定性复现）。数据侧完全正常：`/api/schedule` globalStats 返回 `totalPersonDays/totalHours/totalEarlyMorning/totalDualBroadcast/totalDays`，页面 globalStats 逐一映射、字段逐一匹配（用 PM JWT 实测 27/129/519/54/4；日志亦见 `GET /api/schedule ... 200` 957ms 聚合真实数据）。
- **修复**：StatCard 数值类 `text-white` → `text-foreground`（语义色：浅色 `--foreground≈黑`、深色 `≈白`，两主题均可见）。顺带把 `ExternalScheduleSkeleton` 里 `let cursor`（从不重新赋值，仅 `setDate()` 原地变异）改 `const`，消除该文件既有 prefer-const lint error。
- **验证**：test_run 全绿（lint/ts-check/probe；/schedule→200、/→200、/api/buyin-spike/tasks→401）；build(61/61 EXIT=0)。headless 无头浏览器在沙箱内多次因全局 AuthGuard/路由被弹回 `/` 或崩溃，未能完成完整 App 可视渲染（非改动导致；真机浏览器中 /schedule 正常加载），故以「API 实测数值正确 + 页面字段逐一匹配 + globals CSS 变量证明两主题 contrast」三层证据作为验收依据。

## SOP管理板块（M4：取数结果入库 + 平台内展示）
- **表 buyin_data**（drizzle schema.ts buyinData + exec_sql 双维护）：id/task_id(可空)/account_hint/account_key/stat_date(varchar 10)/data_type/day|hour|anchor|product/dim_key/live_room_id/row_json(jsonb 全量英文字段行)/crawl_status/state_desc/created_at/updated_at。幂等唯一键 `(account_key, stat_date, data_type, dim_key)`，重跑同统计日覆盖更新不堆叠；cookie/签名绝不入库。
- **入库（src/lib/buyin-persist.ts）**：执行器 success/partial 后读 `DATA_DIR/parse/by_info_<date>.json` 真实行逐行 upsert。`dimKeyForRow`：day→'day'、hour→stat_hour、anchor→anchor_name||by_kol_id、product→'product'（skill 单日单聚合行）。`buyin_run_logs.row_count`=实际上库行数（persist.count），失败数追加 detail，不伪造。
- **runner 接入**：buyin-runner.ts runTask 成功后调用 persistBuyinRows（taskId/accountHint/accountKey=pc.accountKey），run_logs.row_count 用上库数。
- **查询 API**：`GET /api/buyin-spike/data`（taskId/startDate/endDate/dataType/accountHint，eq/gte/lte，order by date 升序 limit 2000）；`GET /api/buyin-spike/tasks/[id]/data`（task 路由）。都用 getSopUserContext，外部合作 403；返回 SAFE_SELECT 不带 cookie。日总以 day 行为准，不拿 hour 反推。
- **前端**：`src/components/buyin/ResultsPanel.tsx`（挂 /buyin-spike 页 TaskConfigPanel 下「③ 采集结果 / 数据明细」）。任务下拉(全部/各任务)+粒度(day/hour/anchor/product)+日期区间+刷新；概览四指标(GMV/成交件数/观看人次/新增粉丝，取 day 行)+recharts 折线(GMV/观看按统计日)；明细表列=selected_fields 白名单(缺省 TYPE_FIELDS 按粒度)，表头用 `src/lib/field-cn.ts`（FIELD_CN 81 字段中文名，从 skill dy_by_info.py 提取，字段对不上回落英文）；空态「暂无数据」。挂载时自动 fetch tasks+data。
- **验收口径（实测）**：ts-check 0 / 我的文件 lint 0（全仓 114 条为他人既有 error 未动）/ 生产 build 成功、routes 含 /api/buyin-spike/data 与 tasks/[id]/data；鉴权 401(未登录)/403(外部)/200(PM 空[])；buyin_data upsert 幂等实测（同 key 重插 gmv 100→999 只 1 行不堆叠）；全模块 /buyin-spike /sop /schedule /data-overview /cost /workstation 200。**真实数据端到端仍阻塞：用户尚未重扫 compass（cookie 文件 has_compass=false，无真实 parse）→ buyin_data 0 行（诚实空，未插假数据）**；重扫后对新统计日跑一次即可见到真实行落表并渲染。

## 百应扫码 headful 化 + 账号 auto-align（头像链路改造，仅 dev）
- **环境**：Xvfb `:99`（1280x800x24）常驻（`ensureXvfb` 按需拉起，检测 `/tmp/.X11-unix/X<N>` 避免重复；`BUYIN_DISPLAY` 可改、`BUYIN_HEADLESS=1` 可强制回退无头）。文泉驿中文字体已装。Chromium=playwright-core registry（chromium-1161 chrome-linux/chrome）。
- **headful 扫码** `src/lib/buyin-session.ts`：`startSession` launch 改为 `headless = !display`（有 DISPLAY 即 headful，浏览器进程带 `DISPLAY=:99`、**无 --headless**）；`--disable-blink-features=AutomationControlled` 保留（`navigator.webdriver=false`，够用，不过度 hack）。launch args/env 兜底 headless。登录后同 headful 上下文自然走 buyin→compass SSO，`ensureCompassCookies`（多页导航 home→buyin live-list→compass statement→home + 45s 轮询 marks [ecom_us_lt_compass/ucas_c0_compass/LUOPAN_DT]）仍作兜底。
- **compass cookie 依据（实测）**：`ecom_us_lt_compass` 这组只能在**完整真实扫码登录握手**里 set；headless 里仅导航首页/模块不产生（已多次实测 compass 首页 200 但 0 compass cookie、author API「当前视角与页面不匹配」）。故必须 headful 真实浏览器扫码，才华一次取齐 buyin+compass。
- **账号 auto-align** `src/lib/buyin-cookie-store.ts` + `buyin-runner.ts`：新增 `hasCompleteCookies(cookies)`（sessionid + ecom_us_lt_buyin + ecom_us_lt_compass）、`compassCoverage`、`preferCompleteAccount()`（只返回「最近 update_time 且 buyin+compass 齐全」的账号）。`resolveExecutableCookie` 返回 `{pc, alignedByAccount}`：任务显式 by_account 且持久存在→尊重显式；否则自动打到 `preferCompleteAccount`；无则内存会话兜底。`runTask` 用 `alignedByAccount` 下发 `--by-account` 并作为 `persistBuyinRows.accountHint`（对齐入库账号），不写死。`preferCompleteAccount` 无齐全账号→null（不拿旧不完整账号硬取数，等待新扫码）。
- **现状自检（实测通过）**：Xvfb:99 存活(pid 6186)；dev server 唯一监听 5000(pid 5786=tsx watch src/server.ts)；headful chrome 拉起无 --headless 且 DISPLAY=:99 已验证(session/start 后 pid 6853)；`POST /api/buyin-spike/session/start`(带 PM JWT) 200/waiting_scan/shotMode=qr-img 取到二维码；`/buyin-spike` 200；截图存 `/workspace/projects/data/dy_by/diag/headful_login.png`（登录页，公开二维码无隐私）。ts-check/lint(改动文件 0)/生产 build exit=0 全绿。**两持久文件(5cc/5111)仍 compass 缺失(均为 headless 旧扫，hasCompleteCookies=false)→ preferCompleteAccount 返回 null → 等待用户用新 headful 链路重扫**。扫码用 `bash scripts/dev.sh`，kill 残留用 `pkill -9 -f "cli.mjs watch"`，勿碰 9000。

## 深色主题色板统一替换（蓝live v2 调色板，2026-10）
- 机制：`src/app/globals.css` 的 `.dark{}` 令牌整体替换为文档新调色板，散点用 `src/lib/palette.ts` 主色透明度档 + 任意值类收敛。浅色 `:root`、SOP 日间主题(`sop-theme.css` 的 `.sop-scope`)、主题切换(`blue-theme`+`dark` class) 未改、未破坏。
- 深色令牌：bg #0D0F1A / sidebar&筛选 #151827 / card&表容器 #1E2235 / border rgba(255,255,255,0.08) / primary #4158D0(hover #6A7CDA,pressed #2C42B2)/ accent&徽章底 #2A2E45+白92% / 文字 T1白92% T2白65% T3白40% / chart-1..5 主色 100/80/50/30/15%。语义:--rise #F5483B / --fall #34C759 / --alert #FF9F0A / --badge-bg #2A2E45。
- 涨跌：全平台统一「红涨#F5483B / 绿跌#34C759」，原「绿涨红跌」处已反转为红涨绿跌（data-overview、brand-insight 同比等），仅改色不动箭头/文案。全规色用任意值类 `text-[#34C759]/text-[#F5483B]` 等（两主题一致）。
- 业务线标识（vivo/iQOO/IOT 徽章/圆点/渠道胶囊/brand 卡/登录页/首页/dashboard brand色、cost 分类、schedule 渠道、data-overview BRAND_TABS、visual、sop 深色圆点）→ 统一中性徽章底 #2A2E45（不再用颜色区分）；浅色 day 版 SOP 圆点保留不动。
- 图表多色系（CHART_COLORS/GROUP_COLORS/brand KPI 渐变/平台多色系列）→ 主色+透明度四档（#4158D0、rgba(65,88,208,0.7/0.55/0.4/0.28)）；二色渐变全改「主色+透明度」（non-允许 2 色渐变）。唯一保留非白非灰/非语义色：`#94A3B8`/`#9CA3AF`/`#6B7280`/`#152033`（中性无彩色，误伤成本/轴），sop-theme.css 日间浅色令牌（浅色主题，按约束不改）。
- 状态徽章映射：pending/等待→#FF9F0A、running/进行中→#4158D0、success/已处理/达标→#34C759、failed/超负荷/拒绝→#F5483B（表内色、按区域语义）。
- 注意：`--foreground` 深色改为白92%；primary 按钮 hover/pressed 经 `.dark` 辅助类(#6A7CDA/#2C42B2)提升。测试 `test_run` 通过（lint/ts-check/service_probe/`/`·`/login`·`/sop`·`/api/buyin-spike/data` 200）。dev server=tsx watch src/server.ts(5000)。

## 成本核算·全职薪资非整月放大 Bug 修复（`src/app/api/cost-overview/route.ts` 的 `calcFulltimeCost`）
- **根因**：非整月查询（如 2026-10-01~10-09）把「查询范围内应出勤天数」当月薪分母，且法定节假日薪资多乘 holidayDays。
- **修复**（仅逻辑，未动 UI/颜色/文案/结构/其他成本类型）：
  - 新增 `countExpectedDays(start,end)`：统计范围内周一~周五且非法定节假日天数。
  - `expectedDays = countExpectedDays(effectiveStart,effectiveEnd)`（在职区间裁剪）；`monthWorkDays = max(1, workDays)` 作固定分母。
  - 加班门槛 `expectedHours`：中控 = `monthWorkDays*8`（10月136/9月168），主播固定 90h，不再随查询范围缩放。
  - `holidaySalary`：中控 = `base/monthWorkDays*3`（固定3，去掉 ×holidayDays），主播 = 0。
  - 月薪 `salaryBase`：主播全额 `base+subsidy`；中控整月查询 + 整月在职 → 全额；否则 = `(base+subsidy)/monthWorkDays * expectedDays`（分母与"范围内应出勤天数"均用工作日口径，非实际出勤天数——实际出勤含节假日/周末，会导致偏高，踩过坑）。
  - 运营分支、社保1600、税3.18% 不变。
- **`workDays` 修正**：原式 `daysInMonth - sat(周六) - sun(周日) - legalHolidays` 会把落在周末的法定假日重复扣（10月算出15，实际应17）；改为只扣「落在工作日(周一~五)的法定假日」（遍历1..daysInMonth 用 `isLegalHoliday`+dow 判定）。9月=21 不变，10月=17。此前 10月 `monthWorkDays=15` 直接导致全职成本对不上目标。
- **isFullMonthQuery 时间口径坑**：`parseDateParam(end,true)` 带 23:59:59，而 `monthEnd = new Date(y,m,d)` 为 00:00:00，故 `range.end===monthEnd` 恒 false → 整月查询也走折算分支。但整月查询时 `expectedDays==monthWorkDays`，折算结果==全额，数值等价，无需特判修复。
- **验证（dev 实测）**：10月分段全职=61,636.48（中控14,836.48/张厚羿3785·刘慈航3481·倪休4088·洪元媛3481，运营46,800）；9月整月=93,060（中控46,260，含真实加班如张厚羿202h加班1190）。lint/ts-check/service_probe/成本接口 smoke 全绿。dev 库原状未动。

## 首页概览：iQOO 拆分为「抖音/快手」两张卡（仅首页）
- 背景：首页原为三张品牌卡，现把 iQOO 拆成「iQOO抖音汇总」(iQOO-dy) 与「iQOO快手汇总」(iQOO-ks) 两张，vivo/IOT 不变，共 4 张卡（布局 `md:grid-cols-2 xl:grid-cols-4`）。
- constants.ts：新增 `IQOO_GROUP_META`（iQOO 子分组 id → `{brandKey:'iQOO-dy'|'iQOO-ks', name}`）与 `ACCOUNT_ALIAS_NORMALIZE`（`iQOO官旗`→`iQOO官方旗舰店（抖音）`）。
- store.ts：新增 `calcProfitRateByAccounts(brandId, accountIds, month)`（按账号集合汇总收入；不破坏 calcProfitRate/calcProfitRateByAccount）。
- brand-schedule-stats/route.ts：在 DATA_SOURCES 增加 `iQOO-dy`(sheet 0a2100)/`iQOO-ks`(sheet RYPvqw)，BRAND_TO_SCHEDULES 加子键；readLiveHours 归一账号别名；输出 `brands["iqoo-dy"]`/`brands["iqoo-ks"]` 分项（保留合并 `iQOO`）。抖音=0a2100 表（iQOO手机+iQOO官旗），快手=RYPvqw 表（iQOO官方旗舰店（快手））。
- cost-overview/route.ts：buildFulltimeConfig 全职品牌按项目细分（iQOO快手→iQOO-ks，其余 iQOO→iQOO-dy）；calcFulltimeCost 过滤把 brand="iQOO" 视为 iQOO-dy+iQOO-ks 合并口径；calcDesignCost 加 iQOO-dy/iQOO-ks 关键字映射（iQOO手机→dy、iQOO快手→ks）；GET byBrand 对 brand=all 输出 iQOO-dy/iQOO-ks，且 `byBrand.iQOO = dy+ks`（原 iQOO 合计数值不变）。
- page.tsx：BRANDS 里 iqoo 按 groups 拆两张卡，vivo/IOT 维持单卡；卡片字段沿用（利润率/收入/成本/直播时长/兼职主播·中控/交叉校验）；收入用 calcProfitRateByAccounts（iQOO 收入当前=0）。
- 验证（2026-10 实测）：brand-schedule-stats 抖音228h/快手191h/合并419(dy+ks=合并)；cost-overview byBrand iQOO-dy=118365.19 + iQOO-ks=103173.85 = iQOO=221539.04。lint/ts-check/探活/接口冒烟全绿。
- 红线已守：只动首页链路 4 个文件；未改 feishu/sheets-data/route.ts；未碰颜色/UI 风格/成本公式/费率；成本页 brand=iQOO 的 dimensions 输出与改动前完全一致（全职 aggregate 过滤 + collectScheduleHours("iQOO") 合并、设计 iQOO 全项目、采买合并均保留）；仅预览验证未部署。
