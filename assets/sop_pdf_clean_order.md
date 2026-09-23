# SOP PDF 简洁展示工单（v2.13）

## 背景（已核实）
- 详情页 PDF 用 `<iframe>` 加载签名 URL，浏览器使用内置 PDF 查看器（PDFium，深色工具栏）。
- 用户反馈：PDF 下方"左边那部分"多余——指左侧导航/大纲窗格，以及竖版海报页两侧（尤其左侧）的大块深色留白；希望**简洁、完整地展示 PDF**。
- 竖版图片页（如手机海报）在查看器里偏窄，连续显示时左右留白明显。

## 范围
- 仅前端 `src/components/sop/SopDocDetailBody.tsx` 的 PDF iframe；不改后端、不做OCR、不删数据、不push main、不deploy。
- 分支 feat/sop-management，dev/预览库。

## 具体任务
1. 给 PDF iframe 的 `src`（签名 URL）追加 fragment 参数（fragment 不参与签名、不影响鉴权）：
   - `#navpanes=0`（关闭左侧导航/大纲窗格）
   - `view=FitH`（按宽度适配，让竖版页横向铺满，消除左右大块留白）
   - 形如：`<signedUrl>#navpanes=0&view=FitH`
   - 注意只在原 src 不含 `#` 时追加；若已有 fragment 则合并参数。
2. 在真实/无头浏览器中实测追加后的渲染：
   - 左侧无导航面板；
   - 竖版 PDF 页按容器宽度铺满，左右不再有大块深色留白；纵向滚动可看完整页。
3. 若该查看器对 `view=FitH` 支持不佳，退而求其次：保留 `navpanes=0`，并据实测选择最能"铺满、简洁"的参数组合（如 `#navpanes=0&zoom=page-width`）；以实际渲染为准，简述采用了哪种及原因。
4. 不改动 PdfViewer 的加载骨架/失败兜底/下载按钮；保持 v2.11、v2.12 已上线能力。

## 验收
1. ts-check / lint（改动文件0新增告警）/ build 全绿。
2. 打开 X500（3页竖版）PDF：左侧无窗格、页面按宽度铺满、无大块左右留白，整体简洁，可纵向滚动看完整页。
3. 「重新加载」后 fragment 仍在；下载 PDF 正常。
4. dark/light 正常。
5. 完成后自动重启预览，返回 preview_url。
