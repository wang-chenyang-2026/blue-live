# SOP v2.17 工单：正文链接稳定性 + blockquote 高亮块 + 排版优化

## 背景
飞书在线文档详情页正文用 react-markdown 渲染。此前 callout 转成 `<div class="sop-callout">`，飞书导出残留的 `<p>` 标签把 markdown 链接 `[url](url)` 包在 HTML 块内，react-markdown 不解析 HTML 块内部 markdown，导致链接原样显示、不可点。

服务端抓取脚本已同步改造（配套，不在本工单）：剥离 `<p>`、callout 改为纯 markdown blockquote。前端需配套支持 blockquote 样式并保证链接在任何上下文都稳定可点。

## 改动要求（仅 SOP 详情页正文渲染相关）

### 1. 链接稳定可点
- MarkdownContent 的 `a` 自定义渲染保持二次校验 href：仅允许 http/https/mailto/tel，其余不渲染为链接；外链 `target="_blank" rel="noopener noreferrer"`。
- 链接样式做成醒目且不破坏长 URL：使用主题强调色（参考现有 --sop 主色），underline 或 hover underline；长 URL 允许换行（`word-break: break-word; overflow-wrap: anywhere`），不得撑破容器。
- 确认 blockquote 内的 a 链接同样可点、颜色与引用块背景对比度足够。

### 2. callout 改用 blockquote 渲染并美化
- 正文不再依赖 `.sop-callout` 的 div 方案，新内容为标准 markdown `>` 引用块。请对 `.sop-md blockquote`（或 MarkdownContent 内 blockquote）做高亮块样式：
  - 左侧 3-4px 强调色竖条；
  - 浅色/半透明强调色背景（适配 dark/light 双主题）；
  - 圆角、内边距、与上下段落合理间距；
  - 引用块内的 h1-h4、p、ul/ol、a 颜色与行距正常，不显示引用默认的斜体/引号丑样式；
  - emoji（📌等）正常显示。
- 旧数据若仍存在 `.sop-callout`（历史 div），保留其现有样式作为兜底，不要删除，避免老内容裸奔。

### 3. 正文排版优化（.sop-md）
- 正文字号、行高（建议 1.7-1.8）、段间距舒适；
- h1-h4 层级清晰、与正文间距合理；
- ul/ol 缩进与行距、表格（remark-gfm）内边距与斑马纹沿用现有风格；
- 长词/长链接不溢出，水平方向不出现横向滚动条（表格除外可横向滚动）；
- 整体观感贴近飞书原文档，干净、克制。

## 边界
- 仅 feat/sop-management 分支；仅改 SOP 模块前端与相关样式，不做无关重构。
- 不动生产、不 deploy、不插示例数据。
- 保留 dark/light 双主题（localStorage `blue-theme`，默认 dark）。

## 自检（交付前必须）
- `npm run build`（或项目实际构建命令）通过，无类型错误；
- 详情页正文：blockquote 高亮块正常渲染、块内链接可点击跳转、URL 完整；普通段落链接可点；
- dark/light 两主题下高亮块与链接对比度良好、无横向溢出；
- 历史 `.sop-callout` 兜底样式仍生效。

## 交付物
- 改动清单 + 构建结果 + 自检结论，写入结果回报。
