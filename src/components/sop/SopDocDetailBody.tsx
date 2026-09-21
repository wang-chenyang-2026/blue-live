'use client';

import { useState } from 'react';
import { ExternalLink, Trash2 } from 'lucide-react';

export interface SopDetailDoc {
  id: string;
  title: string;
  scope: string;
  sub_category: string | null;
  source_type: string;
  external_url: string | null;
  needs_quiz: boolean;
  ai_status: string | null;
  ai_summary: string | null;
  ai_keypoints: string[] | null;
  ai_error: string | null;
  content_excerpt: string | null;
  uploader_name: string | null;
  version: number;
  prev_version_at: string | null;
  updated_at: string | null;
  synced_count: number;
  sync_detail: string;
  sync_status: string;
}

const SCOPES: Record<string, { label: string; dot: string }> = {
  general: { label: '通用', dot: '#86909C' },
  vivo: { label: 'vivo品牌类', dot: '#4E5FFF' },
  iqoo_douyin: { label: 'iQOO抖音类', dot: '#FE2C55' },
  iqoo_kuaishou: { label: 'iQOO快手类', dot: '#FF7D00' },
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
  let bg = '#F2F3F5';
  let fg = '#86909C';
  let text = '资料待补充';
  if (aiStatus === 'done') {
    bg = '#E8FFEA';
    fg = '#00B42A';
    text = '已提炼';
  } else if (aiStatus === 'processing') {
    bg = '#E8F3FF';
    fg = '#165DFF';
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

export default function SopDocDetailBody({
  doc,
  canUpload,
  onDelete,
}: {
  doc: SopDetailDoc;
  canUpload: boolean;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const scope = SCOPES[doc.scope] ?? { label: doc.scope, dot: '#86909C' };
  const sourceLabel = doc.source_type === 'feishu' ? '飞书文档' : doc.source_type === 'tencent' ? '腾讯文档' : '文档来源';
  const subCatLabel = doc.sub_category ? SUBCATS[doc.sub_category] ?? doc.sub_category : '';
  const sourceUrl = doc.external_url;

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
      <div className="flex items-center gap-1.5 text-xs" style={{ color: '#86909C' }}>
        <span>{scope.label}</span>
        <span>/</span>
        <span>{subCatLabel || '未分类'}</span>
        <span>/</span>
        <span className="max-w-[220px] truncate">{doc.title}</span>
      </div>

      {/* 标题 + 状态 */}
      <div className="mt-2 flex items-start justify-between gap-3">
        <h2 className="text-[19px] font-bold" style={{ color: '#1D2129' }}>
          {doc.title}
        </h2>
        <StatusBadge aiStatus={doc.ai_status} synced={doc.sync_status} />
      </div>

      {/* 元信息 chips */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={sourceUrl ?? '#'}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: '#E8F3FF', color: '#165DFF' }}
        >
          <ExternalLink size={12} /> 来源：{sourceLabel}（点击查看原文）
        </a>
        <span
          className="inline-flex items-center rounded px-2 py-0.5 text-xs"
          style={{ backgroundColor: '#F2F3F5', color: '#4E5969' }}
        >
          上传人：{doc.uploader_name || '—'} · 更新 {fmtDate(doc.updated_at)}
        </span>
        <span
          className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: '#E8FFEA', color: '#00B42A' }}
        >
          {doc.sync_status}
        </span>
        <span
          className="inline-flex items-center rounded px-2 py-0.5 text-xs"
          style={{ backgroundColor: '#F2F3F5', color: '#4E5969' }}
        >
          版本 v{doc.version}
          {doc.prev_version_at ? ` · 上一版 ${fmtDate(doc.prev_version_at)}` : ''}
        </span>
        {doc.needs_quiz && (
          <span className="rounded px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: '#FFECE8', color: '#F53F3F' }}>
            需考核
          </span>
        )}
      </div>

      {/* AI 提炼框 */}
      <div
        className="mt-4 rounded-lg border p-4"
        style={{
          borderColor: '#D6E4FF',
          background: 'linear-gradient(160deg, #F5F9FF 0%, #FDFEFF 100%)',
        }}
      >
        <div className="mb-2 flex items-center gap-1.5 text-[15px] font-semibold" style={{ color: '#165DFF' }}>
          <span className="text-base leading-none">✨</span> AI 提炼
        </div>
        {doc.ai_status === 'done' && doc.ai_summary ? (
          <>
            <p className="text-sm" style={{ color: '#1D2129' }}>
              {doc.ai_summary}
            </p>
            {Array.isArray(doc.ai_keypoints) && doc.ai_keypoints.length > 0 && (
              <ol className="mt-2 space-y-1">
                {doc.ai_keypoints.map((k, i) => (
                  <li key={i} className="flex gap-2 text-sm" style={{ color: '#4E5969' }}>
                    <span style={{ color: '#165DFF' }}>{i + 1}.</span>
                    <span>{k}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : doc.ai_status === 'processing' ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: '#165DFF' }}>
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            AI 正在提炼正文内容，请稍候刷新…
          </div>
        ) : (
          <div className="text-sm" style={{ color: '#86909C' }}>
            AI 提炼暂不可用{doc.ai_error ? `（${doc.ai_error}）` : ''}，可直接查看原文或由上传人手动补充内容。
          </div>
        )}
      </div>

      {/* 正文摘录 */}
      <div className="mt-4 mb-2 text-[13px] font-semibold" style={{ color: '#1D2129' }}>
        内容摘录
      </div>
      <div
        className="flex-1 rounded-lg border p-4"
        style={{ borderColor: '#E5E6EB', backgroundColor: '#FFFFFF' }}
      >
        {doc.content_excerpt ? (
          <p
            className="whitespace-pre-wrap text-[13px] leading-[1.85]"
            style={{ color: '#4E5969' }}
          >
            {doc.content_excerpt}
          </p>
        ) : (
          <p className="text-[13px]" style={{ color: '#C9CDD4' }}>
            暂无正文摘录，若来源为飞书文档可在上传后自动提炼后补充。
          </p>
        )}
      </div>

      {/* 底部操作 */}
      <div className="mt-4 flex items-center gap-3">
        <a
          href={sourceUrl ?? '#'}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          style={{ border: '1px solid #165DFF', color: '#165DFF', background: '#FFFFFF' }}
        >
          <ExternalLink size={14} />
          查看{sourceLabel === '腾讯文档' ? '腾讯文档原文' : '飞书原文'}
        </a>
        {canUpload && onDelete && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            style={{ border: '1px solid #F53F3F', color: '#F53F3F', background: '#FFF7F5' }}
          >
            <Trash2 size={14} /> 删除
          </button>
        )}
      </div>

      {/* 二次确认 */}
      {confirming && (
        <div className="mt-3 rounded-lg border p-3" style={{ borderColor: '#FADBDA', backgroundColor: '#FFF7F5' }}>
          <p className="text-sm" style={{ color: '#4E5969' }}>
            删除后该业务线相关人员将不再看到此文档，且其已读记录一并清除，确认删除？
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={handleDelete}
              className="rounded-md px-3 py-1 text-sm font-medium text-white"
              style={{ backgroundColor: '#F53F3F' }}
            >
              {deleting ? '删除中…' : '确认删除'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md px-3 py-1 text-sm"
              style={{ backgroundColor: '#F2F3F5', color: '#4E5969' }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}