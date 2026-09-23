# SOP 图片 PDF 平台展示优化工单（v2.11）

## 背景与现状（已核实，勿重复怀疑数据层）
- 图片上传勾选"合并生成一个 PDF"后，dev 库记录字段已正确：`source_type=file`、`file_kind=pdf`、`mime_type=application/pdf`、`file_url` 指向合并后的多页 PDF（如 `19fb6f8d/____X500____.pdf`），原图保存在 `original_file_url` / `original_mime_type`（JSON 数组，顺序=提交序）。
- 详情页 `src/components/sop/SopDocDetailBody.tsx` 对 `file_kind=pdf` 已用 `<iframe>` 渲染 `file_signed_url`，`file_kind=image` 才用 `<img>`。
- 用户实际观感仍是"像一堆图片"。根因偏前端展示体验：iframe 无加载/失败兜底、高度生硬；签名 URL 900s 过期或加载失败时可能白屏；旧标签 chunk 缓存；以及预览实例被回收过。

## 本轮范围（重要边界）
- **不引入视觉模型 / 不做 OCR / 不生成 AI 摘要**（Ark API Key 未到位，后续单独做）。
- 不改上传合并业务逻辑、不删数据、不插示例数据、不 push main、不 deploy。
- 仅在 feat/sop-management 分支、dev/预览库。

## 具体任务

### 1. 复核图片→PDF 生成质量
文件：`src/lib/img-to-pdf.ts`（`buildImagesPdf`，pdf-lib）
- jpg/jpeg/png 单页贴合：页面尺寸 = 像素 × 0.75pt，铺满、无白边、不拉伸变形。
- 多图合并：页序严格等于用户选图/提交顺序；PDF 头有效、可被标准阅读器打开。
- 单图与多图合并两条路径都确认无误。

### 2. 详情页 PDF 展示优化（核心）
文件：`src/components/sop/SopDocDetailBody.tsx`
- **铁律：`file_kind=pdf` 只走 PDF 阅读器（iframe）渲染 `file_signed_url`，任何情况下都不得退回 `<img>` 原图画廊。**
- iframe 加载体验：
  - 加载中显示骨架/「PDF 加载中…」；
  - `file_signed_url` 为空或 iframe 加载失败（onError/超时）时，展示明确兜底：失败原因提示 + 「重新加载」按钮（可重新拉取详情刷新签名 URL）+ 「下载 PDF」按钮，不允许白屏或静默；
  - 高度自适应、观感协调：使用更合理的展示高度（如结合视口，最小高度保证可见），dark/light 双主题下边框、背景统一。
- 顶部文件信息清晰标注：`PDF · N页 · 由N张图片生成`（页数可从合并图片数或 PDF 页数得到）；`查看原图(N张)` 保留为次要小入口，不喧宾夺主。

### 3. 不做的事
- 不动「AI 提炼」「内容摘录」两个区块的结构（视觉模型接入后会自然有内容，届时再统一）。
- 不改后端签名时长、不改 Storage 桶策略。

## 验收标准
1. `ts-check` / `lint`（改动文件无新增告警）/ 生产 `build` 全绿。
2. 端到端：上传 3 张图片（含 jpg/png）并勾选合并 → 详情页以 PDF 阅读器正常显示 3 页 PDF，页序正确、铺满，页面**不出现图片画廊式的散图主展示**。
3. 制造签名失效/加载失败场景时，出现「重新加载 / 下载 PDF」兜底，不白屏。
4. 「查看原图(3张)」小入口可正常打开原图。
5. 非合并（单图）路径仍正常：单图→单页 PDF。
6. dark/light 两主题展示正常。
7. 权限：非项目负责人上传/删除仍 403（回归即可，不必新增）。
8. 测试完成后清理全部测试记录与对象，恢复 dev 库原状、桶无残留；还原构建噪声文件。
9. 完成后自动重启预览，返回 preview_url。

## 交付
- 简述改动文件清单、自测结果（对照 1~9）、环境恢复情况。
