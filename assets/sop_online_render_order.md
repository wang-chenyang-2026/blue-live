# SOP 在线文档正文直接展示工单（v2.15）

## 背景（已实测）
- 飞书在线文档（source_type='feishu'，external_url 为 /wiki/ 或 /docx/ 链接）入库时只存了链接，content_body 为空，详情页"正式内容"显示「原文内容暂无法直接展示，请点击顶部『查看飞书原文』」。
- 飞书文档不可 iframe 跨域内嵌；bot 身份对未授权文档无读取权限；正文将由后台脚本（持用户授权）抓取为 Markdown 写入 content_body。
- 本工单负责**前端：把抓回来的 content_body（Markdown）在详情页直接渲染为正文**。

## 范围
- 仅前端，重点 src/components/sop/SopDocDetailBody.tsx；分支 feat/sop-management，dev/预览库；不 push main、不 deploy、不碰生产。
- 不负责抓取（抓取由独立 CodeAct 脚本完成）。

## 任务
1. 当文档为在线来源（source_type='feishu'，并兼容其它在线/外部来源）且 content_body 非空时，「正式内容」区直接**渲染 Markdown 正文**，不再显示"暂无法直接展示"兜底：
   - 正确渲染标题、段落、有序/无序列表、加粗、引用、分隔线、表格（飞书导出的 markdown 含表格）、链接（外链新窗口打开）。
   - 优先复用项目已有 markdown 渲染能力；若没有，选用成熟方案（如 react-markdown + remark-gfm）或实现可靠的轻量渲染，由你按工程现状决定；注意 XSS 安全（不直接 dangerouslySetInnerOriginal 未清洗内容，链接过滤 javascript:）。
2. 处理飞书导出的特殊标签（正文是从飞书 docx 导出的 markdown）：
   - `<callout emoji="…">…</callout>`：渲染为带 emoji 的提示/高亮块（用 --sop-* 主题变量）；
   - `<sheet …></sheet>`、`<title>…</title>` 等：忽略或转换——title 不重复展示（页面已有标题），sheet 可省略或转为"内含表格，见原文"的提示并保留"查看飞书原文"；
   - 其余未知 HTML 标签安全降级为纯文本，不报错、不破坏排版。
3. 长文排版：合理的行宽/行距、目录层级清晰；代码/超长内容横向滚动；沿用 dark/light 主题。
4. 保留顶部「查看飞书原文/查看原文档」入口；content_body 仍为空时维持现有兜底文案（脚本还没抓到时的正常态）。
5. 不破坏 sheet（SheetTablePanel）、pdf（PdfViewer）、image、本地文档等既有展示分支。

## 验收
1. ts-check / lint（改动文件0新增告警）/ build 全绿。
2. 对 content_body 已写入飞书正文的文档（如 vivo主播话术优化）：详情页直接展示完整排版正文（标题/列表/表格/高亮块/加粗/引用正确），无需跳转；"查看飞书原文"仍在。
3. content_body 为空的在线文档仍显示原兜底，不白屏。
4. sheet/pdf/image 回归正常；dark/light 正常；链接安全（无 javascript:）。
5. 完成后自动重启预览并返回 preview_url。
