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
