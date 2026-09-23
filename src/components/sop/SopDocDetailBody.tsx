'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { ExternalLink, Loader2, Trash2 } from 'lucide-react';
import './sop-theme.css';

export interface SopDetailDoc {
  id: string;
  title: string;
  scope: string;
  sub_category: string | null;
  source_type: string;
  external_url: string | null;
  needs_quiz: boolean;
  ai_status: string | null;
  content_excerpt: string | null;
  content_body: string | null;
  // v2.14 表格结构化数据（JSON 字符串：sheets[]）
  content_sheet?: string | null;
  uploader_name: string | null;
  version: number;
  prev_version_at: string | null;
  updated_at: string | null;
  synced_count: number;
  sync_detail: string;
  sync_status: string;
  // 本地文件字段
  file_kind?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  file_signed_url?: string | null;
  original_file_url?: string | null;
  original_signed_urls?: Array<{ url: string | null; mime?: string | null }> | null;
}

const SCOPES: Record<string, { label: string }> = {
  general: { label: '通用' },
  vivo: { label: 'vivo品牌类' },
  iqoo_douyin: { label: 'iQOO抖音类' },
  iqoo_kuaishou: { label: 'iQOO快手类' },
};

const SUBCATS: Record<string, string> = {
  product: '产品知识',
  culture: '企业文化',
  management: '日常管理',
  live_standard: '直播标准',
  other: '其它',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function StatusBadge({ aiStatus, synced }: { aiStatus: string | null; synced: string }) {
  let bg = 'var(--sop-muted)';
  let fg = 'var(--sop-t3)';
  let text = '资料待补充';
  if (aiStatus === 'done') {
    bg = 'var(--sop-success-bg)';
    fg = 'var(--sop-success)';
    text = '已提炼';
  } else if (aiStatus === 'processing') {
    bg = 'var(--sop-primary-bg)';
    fg = 'var(--sop-primary)';
    text = '提炼中';
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: bg, color: fg }}
    >
      {text}
      {aiStatus === 'done' && <span className="opacity-80">· {synced}</span>}
    </span>
  );
}

const PDF_LOAD_TIMEOUT_MS = 25000;

// 图片转 PDF 文档主展示：只走 PDF 阅读器（iframe）渲染签名 URL，绝不退回 <img> 原图画廊。
// 提供加载骨架、onError/超时兜底（重新加载 → 重新拉详情刷新签名 URL；下载 PDF）。
type PdfStatus = 'loading' | 'ready' | 'error';

// fragment 不参与签名、不影响鉴权；在签名 URL 后追加 PDF 阅读器展示参数：
// navpanes=0 关闭左侧导航/大纲窗格，view=FitH 按宽度适配（竖版页横向铺满，消除左右大块留白）。
// 仅在原址无 fragment 时追加；已有 fragment 则合并覆盖同名参数（若已存在）。
function withPdfViewerParams(url: string): string {
  if (!url) return url;
  const hashIdx = url.indexOf('#');
  const base = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
  const raw = hashIdx >= 0 ? url.slice(hashIdx + 1) : '';
  const params = new URLSearchParams(raw);
  params.set('navpanes', '0');
  params.set('view', 'FitH');
  const q = params.toString();
  return q ? `${base}#${q}` : base;
}

function PdfViewer({
  url,
  fileName,
  onReload,
}: {
  url: string;
  fileName?: string | null;
  onReload: () => void;
}) {
  const [status, setStatus] = useState<PdfStatus>(() => (url ? 'loading' : 'error'));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewerSrc = withPdfViewerParams(url); // 关闭左侧窗格 + 按宽适配

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!url) {
      setStatus('error');
      return;
    }
    setStatus('loading');
    timer.current = setTimeout(() => {
      setStatus((s) => (s === 'loading' ? 'error' : s));
    }, PDF_LOAD_TIMEOUT_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [url]);

  return (
    <div className="overflow-hidden rounded-md border" style={{ borderColor: 'var(--sop-border)', backgroundColor: 'var(--sop-panel)' }}>
      {status === 'error' ? (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center" style={{ minHeight: 340 }}>
          <p className="text-[13px]" style={{ color: 'var(--sop-t2)' }}>
            {url ? 'PDF 加载失败：签名链接失效或网络异常。' : 'PDF 暂无法在线预览（链接未就绪）。'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setStatus('loading');
                onReload();
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--sop-primary-bg)', color: 'var(--sop-primary)' }}
            >
              <Loader2 size={14} className="animate-spin" /> 重新加载
            </button>
            {url && (
              <a
                href={url}
                download={fileName ?? 'document.pdf'}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                style={{ border: '1px solid var(--sop-border)', color: 'var(--sop-t2)', backgroundColor: 'var(--sop-panel)' }}
              >
                <ExternalLink size={14} /> 下载 PDF
              </a>
            )}
          </div>
        </div>
      ) : (
        <>
          {status === 'loading' && (
            <div
              className="flex items-center justify-center gap-2 text-sm"
              style={{ color: 'var(--sop-t3)', backgroundColor: 'var(--sop-panel)' }}
            >
              <span
                className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                style={{ color: 'var(--sop-primary)' }}
              />
              PDF 加载中…
            </div>
          )}
          <iframe
            src={viewerSrc}
            title={fileName ?? 'PDF'}
            onLoad={() => setStatus('ready')}
            className="w-full"
            style={{
              display: status === 'loading' ? 'none' : 'block',
              height: 'clamp(440px, 62vh, 780px)',
              border: 'none',
              backgroundColor: 'var(--sop-panel)',
            }}
          />
        </>
      )}
    </div>
  );
}

// 放行飞书导出 markdown 的自定义 HTML 标签，供 react-markdown 自定义渲染
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    // title 为原生元素，无需在此声明
    interface IntrinsicElements {
      callout: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { emoji?: string };
      sheet: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

// 在线正文 markdown：把脚本抓回并写入 content_body 的 Markdown 完整渲染（标题/列表/表格/引用/加粗/链接）。
// 只读系统边界内容，经过 rehype-sanitize 清洗（javascript: 等危险协议与 on* 事件默认被剔除）后再渲染；
// 额外通过自定义 <a> 二次校验 href，杜绝危险链接。飞书特殊标签：
//  <callout emoji="…">…</callout> → emoji 高亮提示块；<sheet …/> → 原文提示；<title>…</title> → 不重复展示。
const MD_SCHEMA = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'callout',
    'sheet',
    'title',
    'br',
    'del',
    'sub',
    'sup',
    'mark',
  ],
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    callout: ['emoji'],
    sheet: ['block_id', 'token'],
  },
};

function MarkdownContent({ content }: { content: string }) {
  if (!content) return null;

  const components: React.ComponentProps<typeof ReactMarkdown>['components'] = {
    a: ({ href, children }: { href?: string | undefined; children?: React.ReactNode }) => {
      const safe = typeof href === 'string' && /^(https?:|mailto:|tel:)/i.test(href) ? href : null;
      return safe ? (
        <a href={safe} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ) : (
        <span>{children}</span>
      );
    },
    callout: ({ emoji, children }: { emoji?: string | undefined; children?: React.ReactNode }) => (
      <div className="sop-callout">
        <span className="sop-callout-emoji" aria-hidden>
          {typeof emoji === 'string' && emoji.trim() ? emoji : '💡'}
        </span>
        <div className="sop-callout-body">{children}</div>
      </div>
    ),
    sheet: () => <div className="sop-sheet-hint">内含表格，详见原文</div>,
    title: () => null,
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="table-wrap">
        <table>{children}</table>
      </div>
    ),
  };

  return (
    <div className="sop-md text-[13.5px] leading-[1.85]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, MD_SCHEMA]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

interface SheetData {
  name: string;
  header: string[];
  rows: string[][];
  totalRows: number;
  shown: number;
  truncated: boolean;
}

// 表格文件（xlsx/xls/csv）：解析 content_sheet JSON 并按 sheet 分页签表格化展示。
// 表头 + 斑马纹 + 横向/纵向滚动 + 截断提示；沿用 var(--sop-*) 主题变量，dark/light 自动切换。
function SheetTablePanel({ raw }: { raw: string }) {
  const [sheets, setSheets] = useState<SheetData[]>(() => {
    try {
      const s = JSON.parse(raw) as unknown;
      return Array.isArray(s) ? (s as SheetData[]) : [];
    } catch {
      return [];
    }
  });
  const [active, setActive] = useState(0);

  useEffect(() => {
    try {
      const s = JSON.parse(raw) as unknown;
      setSheets(Array.isArray(s) ? (s as SheetData[]) : []);
    } catch {
      setSheets([]);
    }
    setActive(0);
  }, [raw]);

  if (sheets.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: 'var(--sop-t3)' }}>
        表格内容暂无法解析，请点击顶部「下载原文件」查看。
      </p>
    );
  }

  const cur = sheets[Math.min(active, sheets.length - 1)];
  const maxCols = Math.max(
    cur.header.length,
    ...cur.rows.map((r) => r.length),
    1,
  );

  return (
    <div>
      {sheets.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {sheets.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className="rounded px-2 py-0.5 text-xs font-medium transition-colors"
              style={
                i === active
                  ? { backgroundColor: 'var(--sop-primary)', color: 'var(--sop-primary-ink, #fff)' }
                  : { backgroundColor: 'var(--sop-muted)', color: 'var(--sop-t2)' }
              }
            >
              {s.name || `Sheet ${i + 1}`}
              {s.truncated ? `（前 ${s.shown}）` : ''}
            </button>
          ))}
        </div>
      )}

      <div
        className="overflow-auto rounded-md border"
        style={{ borderColor: 'var(--sop-border)', maxHeight: 480, backgroundColor: 'var(--sop-panel)' }}
      >
        <table className="w-full border-collapse text-[13px]" style={{ minWidth: maxCols * 80 }}>
          <thead>
            <tr>
              {cur.header.length === 0 ? (
                <th
                  className="px-2 py-1.5 text-left font-semibold"
                  style={{ color: 'var(--sop-t2)', borderBottom: '1px solid var(--sop-border)' }}
                >
                  （无表头）
                </th>
              ) : (
                cur.header.map((h, i) => (
                  <th
                    key={i}
                    className="whitespace-nowrap border-b px-2 py-1.5 text-left font-semibold"
                    style={{ color: 'var(--sop-t1)', borderColor: 'var(--sop-border)', backgroundColor: 'var(--sop-soft)' }}
                  >
                    {h || `列 ${i + 1}`}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {cur.rows.length === 0 ? (
              <tr>
                <td colSpan={cur.header.length || 1} className="px-2 py-3 text-[13px]" style={{ color: 'var(--sop-t3)' }}>
                  该 Sheet 暂无数据行。
                </td>
              </tr>
            ) : (
              cur.rows.map((r, i) => (
                <tr key={i} style={i % 2 === 1 ? { backgroundColor: 'var(--sop-soft)' } : undefined}>
                  {Array.from({ length: maxCols }).map((_, c) => (
                    <td
                      key={c}
                      className="whitespace-nowrap border-b px-2 py-1 align-top"
                      style={{ color: 'var(--sop-t2)', borderColor: 'var(--sop-border)' }}
                    >
                      {r[c] ?? ''}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {cur.truncated && (
        <p className="mt-1.5 text-xs" style={{ color: 'var(--sop-t3)' }}>
          共 {cur.totalRows} 行，展示前 {cur.shown} 行。
        </p>
      )}
    </div>
  );
}

export default function SopDocDetailBody({
  doc,
  canUpload,
  onDelete,
  onRefreshDoc,
}: {
  doc: SopDetailDoc;
  canUpload: boolean;
  onDelete?: (id: string) => Promise<void>;
  onRefreshDoc?: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const scope = SCOPES[doc.scope] ?? { label: doc.scope };
  const sourceLabel = doc.source_type === 'feishu' ? '飞书文档' : doc.source_type === 'tencent' ? '腾讯文档' : doc.source_type === 'file' ? '本地文件' : '文档来源';
  const subCatLabel = doc.sub_category ? SUBCATS[doc.sub_category] ?? doc.sub_category : '';
  const sourceUrl = doc.external_url;
  const isFile = doc.source_type === 'file';
  const fileKind = doc.file_kind ?? 'other';
  const isImageFile = isFile && fileKind === 'image';
  const isPdfFile = isFile && fileKind === 'pdf';
  // 图片转 PDF 文档：主文件为 PDF，另有原图（original_file_url / original_signed_urls）
  const hasOriginals = isFile && Array.isArray(doc.original_signed_urls) && doc.original_signed_urls.length > 0;
  const firstOriginal = hasOriginals ? doc.original_signed_urls![0] : null;
  // 页数/生成图片数：优先取签名原图数组；不可见时回退解析 original_file_url JSON
  const originalCount = isFile
    ? (doc.original_signed_urls?.length ??
        (() => {
          try {
            return (JSON.parse(doc.original_file_url ?? '[]') as string[]).length;
          } catch {
            return 0;
          }
        })())
    : 0;

  const handleReloadPdf = () => {
    if (onRefreshDoc) onRefreshDoc();
    else window.location.reload();
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(doc.id);
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* 面包屑 */}
      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--sop-t3)' }}>
        <span>{scope.label}</span>
        <span>/</span>
        <span>{subCatLabel || '未分类'}</span>
        <span>/</span>
        <span className="max-w-[220px] truncate">{doc.title}</span>
      </div>

      {/* 标题 + 状态 */}
      <div className="mt-2 flex items-start justify-between gap-3">
        <h2 className="text-[19px] font-bold" style={{ color: 'var(--sop-t1)' }}>
          {doc.title}
        </h2>
        <StatusBadge aiStatus={doc.ai_status} synced={doc.sync_status} />
      </div>

      {/* 元信息 chips */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isFile ? (
          <>
            <a
              href={doc.file_signed_url ?? '#'}
              download={doc.file_name ?? undefined}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: 'var(--sop-primary-bg)', color: 'var(--sop-primary)' }}
              title={doc.file_kind === 'pdf' ? '下载 PDF' : '下载原文件'}
            >
              <ExternalLink size={12} /> {doc.file_kind === 'pdf' ? '下载 PDF' : '下载原文件'}
              {doc.file_name ? `（${doc.file_name}）` : ''}
            </a>
            {isPdfFile && originalCount > 0 && (
              <span
                className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: 'var(--sop-primary-bg)', color: 'var(--sop-primary)' }}
              >
                PDF · {originalCount} 页 · 由 {originalCount} 张图片生成
              </span>
            )}
            {hasOriginals && firstOriginal?.url && (
              <a
                href={firstOriginal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: 'var(--sop-muted)', color: 'var(--sop-t2)' }}
              >
                <ExternalLink size={12} /> 查看原图{originalCount > 1 ? `（${originalCount} 张）` : ''}
              </a>
            )}
          </>
        ) : (
          <a
            href={sourceUrl ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: 'var(--sop-primary-bg)', color: 'var(--sop-primary)' }}
          >
            <ExternalLink size={12} /> 查看{sourceLabel === '腾讯文档' ? '腾讯文档原文' : '飞书原文'}
          </a>
        )}
        <span
          className="inline-flex items-center rounded px-2 py-0.5 text-xs"
          style={{ backgroundColor: 'var(--sop-muted)', color: 'var(--sop-t2)' }}
        >
          上传人：{doc.uploader_name || '—'} · 更新 {fmtDate(doc.updated_at)}
        </span>
        <span
          className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: 'var(--sop-success-bg)', color: 'var(--sop-success)' }}
        >
          {doc.sync_status}
        </span>
        <span
          className="inline-flex items-center rounded px-2 py-0.5 text-xs"
          style={{ backgroundColor: 'var(--sop-muted)', color: 'var(--sop-t2)' }}
        >
          版本 v{doc.version}
          {doc.prev_version_at ? ` · 上一版 ${fmtDate(doc.prev_version_at)}` : ''}
        </span>
        {doc.needs_quiz && (
          <span className="rounded px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: 'var(--sop-danger-bg)', color: 'var(--sop-danger)' }}>
            需考核
          </span>
        )}
      </div>

      {/* 内容摘要 */}
      <div className="mt-4 mb-2 text-[13px] font-semibold" style={{ color: 'var(--sop-t1)' }}>
        内容摘要
      </div>
      <div
        className="flex-1 rounded-lg border p-4"
        style={{ borderColor: 'var(--sop-border)', backgroundColor: 'var(--sop-panel)' }}
      >
        {doc.content_excerpt ? (
          <p
            className="whitespace-pre-wrap text-[13px] leading-[1.85]"
            style={{ color: 'var(--sop-t2)' }}
          >
            {doc.content_excerpt}
          </p>
        ) : (
          <p className="text-[13px]" style={{ color: 'var(--sop-t4)' }}>
            暂无内容摘要。图片/文档的内容识别能力接入后将自动生成。
          </p>
        )}
      </div>

      {/* 正式内容 / 原文：飞书正文全文；本地文件则内联展示文件/文本 */}
      <div className="mt-4 text-[13px] font-semibold" style={{ color: 'var(--sop-t1)' }}>
        正式内容
        <span className="ml-2 text-xs font-normal" style={{ color: 'var(--sop-t3)' }}>
          {isFile ? `本地上传 · ${doc.file_name ?? ''}${doc.file_size ? ` · ${(doc.file_size / 1024 / 1024).toFixed(1)}MB` : ''}` : '完整内容以来源文档为准'}
        </span>
      </div>
      <div
        className="rounded-lg border p-4"
        style={{ borderColor: 'var(--sop-border)', backgroundColor: 'var(--sop-panel)' }}
      >
        {isImageFile ? (
          doc.file_signed_url && !/\.svg$/i.test(doc.file_name ?? '') ? (
            <img
              src={doc.file_signed_url}
              alt={doc.file_name ?? '图片'}
              onClick={() => setPreviewUrl(doc.file_signed_url ?? null)}
              className="max-w-full cursor-zoom-in rounded-md border"
              style={{ borderColor: 'var(--sop-border)' }}
            />
          ) : (
            <p className="text-[13px]" style={{ color: 'var(--sop-t3)' }}>
              图片为 SVG 或暂无法在线预览，请点击顶部「下载原文件」查看。
            </p>
          )
        ) : isPdfFile ? (
          // 铁律：file_kind=pdf 只走 PDF 阅读器渲染签名 URL，空/失效时展示兜底，绝不 .replace 为 <img> 原图画廊
          <PdfViewer url={doc.file_signed_url ?? ''} fileName={doc.file_name} onReload={handleReloadPdf} />
        ) : !isFile && doc.content_body ? (
          // 在线文档（飞书/腾讯/manual）：脚本抓回写入 content_body 的 Markdown 正文直接渲染
          <MarkdownContent content={doc.content_body} />
        ) : doc.file_kind === 'sheet' && doc.content_sheet ? (
          // 表格文件（xlsx/xls/csv）：按 sheets 结构化数据表格化展示
          <SheetTablePanel raw={doc.content_sheet} />
        ) : doc.content_body ? (
          <div
            className="max-h-[720px] overflow-auto whitespace-pre-wrap text-[13.5px] leading-[1.9]"
            style={{ color: 'var(--sop-t2)' }}
          >
            {doc.content_body}
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: 'var(--sop-t3)' }}>
            {isFile ? '原文件暂无法在线预览，请点击顶部「下载原文件」查看。' : '原文内容暂无法直接展示，请点击顶部「查看原文」链接访问。'}
          </p>
        )}
      </div>

      {/* 图片放大预览 */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
          onClick={() => setPreviewUrl(null)}
        >
          <img src={previewUrl} alt="预览" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}

      {/* 底部操作：仅保留删除（原文外链入口在顶部元信息行） */}
      <div className="mt-4 flex items-center gap-3">
        {canUpload && onDelete && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            style={{ border: '1px solid var(--sop-danger)', color: 'var(--sop-danger)', background: 'var(--sop-danger-soft)' }}
          >
            <Trash2 size={14} /> 删除
          </button>
        )}
      </div>

      {/* 二次确认 */}
      {confirming && (
        <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--sop-danger-line)', backgroundColor: 'var(--sop-danger-soft)' }}>
          <p className="text-sm" style={{ color: 'var(--sop-t2)' }}>
            删除后该业务线相关人员将不再看到此文档，且其已读记录一并清除，确认删除？
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={handleDelete}
              className="rounded-md px-3 py-1 text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--sop-danger)' }}
            >
              {deleting ? '删除中…' : '确认删除'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md px-3 py-1 text-sm"
              style={{ backgroundColor: 'var(--sop-muted)', color: 'var(--sop-t2)' }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}