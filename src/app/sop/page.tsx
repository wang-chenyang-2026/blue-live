'use client';

import { useEffect, useMemo, useState } from 'react';
import { PlusIcon, Search } from 'lucide-react';
import SopDocDetailBody, { SopDetailDoc } from '@/components/sop/SopDocDetailBody';
import '@/components/sop/sop-theme.css';

type SopListItem = {
  id: string;
  title: string;
  scope: string;
  sub_category: string | null;
  source_type: string;
  external_url: string | null;
  needs_quiz: boolean;
  ai_status: string | null;
  ai_summary: string | null;
  content_excerpt: string | null;
  ai_error: string | null;
  ai_keypoints: string[] | null;
  uploader_name: string | null;
  version: number;
  prev_version_at: string | null;
  updated_at: string | null;
  synced_count: number;
  sync_detail: string;
  sync_status: string;
  read: boolean;
};

interface ListResp {
  docs: SopListItem[];
  scopes: string[];
  canUpload: boolean;
}

const SCOPES: { value: string; label: string; sub: string }[] = [
  { value: 'general', label: '通用', sub: '全业务线共用制度' },
  { value: 'vivo', label: 'vivo品牌类', sub: 'vivo 项目专用' },
  { value: 'iqoo_douyin', label: 'iQOO抖音类', sub: 'iQOO · 抖音渠道' },
  { value: 'iqoo_kuaishou', label: 'iQOO快手类', sub: 'iQOO · 快手渠道' },
];

const SUBCATS: { value: string; label: string }[] = [
  { value: 'product', label: '产品知识' },
  { value: 'culture', label: '企业文化' },
  { value: 'management', label: '日常管理' },
  { value: 'live_standard', label: '直播标准' },
  { value: 'other', label: '其它' },
];

const SOURCE_LABEL: Record<string, string> = { feishu: '飞书', tencent: '腾讯文档' };

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function SopPage() {
  const [allDocs, setAllDocs] = useState<SopListItem[]>([]);
  const [visibleScopes, setVisibleScopes] = useState<string[]>(['general']);
  const [canUpload, setCanUpload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedScope, setSelectedScope] = useState<string>('general');
  const [selectedTab, setSelectedTab] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sop/documents');
      const json = (await res.json()) as ListResp;
      setAllDocs(json.docs ?? []);
      setVisibleScopes(json.scopes?.length ? json.scopes : ['general']);
      setCanUpload(!!json.canUpload);
      // 默认选中「通用」；若通用为空则退回第一个可见域
      setSelectedScope((prev) => {
        const ok = json.scopes?.includes(prev);
        if (ok) return prev;
        return (json.scopes && json.scopes[0]) || 'general';
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // 各业务线真实计数（不随 tab/搜索变化）
  const scopeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of SCOPES) m[s.value] = 0;
    for (const d of allDocs) m[d.scope] = (m[d.scope] ?? 0) + 1;
    return m;
  }, [allDocs]);

  const scopeDocs = useMemo(() => allDocs.filter((d) => d.scope === selectedScope), [allDocs, selectedScope]);

  const tabCounts = useMemo(() => {
    const m: Record<string, number> = { all: scopeDocs.length };
    for (const t of SUBCATS) m[t.value] = scopeDocs.filter((d) => d.sub_category === t.value).length;
    return m;
  }, [scopeDocs]);

  const filteredDocs = useMemo(() => {
    let list = scopeDocs;
    if (selectedTab !== 'all') list = list.filter((d) => d.sub_category === selectedTab);
    if (keyword.trim()) {
      const k = keyword.trim();
      list = list.filter((d) => d.title.includes(k) || (d.ai_summary ?? '').includes(k));
    }
    return list;
  }, [scopeDocs, selectedTab, keyword]);

  // 选中态=当前筛选列表内的用户选择；无选择（含首次进入/切换业务线/分类/搜索）时默认取第一篇
  const activeId = useMemo(() => {
    if (filteredDocs.some((d) => d.id === selectedId)) return selectedId;
    return filteredDocs[0]?.id ?? null;
  }, [filteredDocs, selectedId]);

  const selectedDoc = useMemo(() => filteredDocs.find((d) => d.id === activeId) ?? null, [filteredDocs, activeId]);

  // 分组（Tab=全部时按二级类目分组）
  const grouped = useMemo(() => {
    if (selectedTab !== 'all') return [];
    const g: { label: string; docs: SopListItem[] }[] = [];
    for (const t of SUBCATS) {
      const docs = filteredDocs.filter((d) => d.sub_category === t.value);
      if (docs.length) g.push({ label: t.label, docs });
    }
    const other = filteredDocs.filter((d) => d.sub_category && !SUBCATS.some((s) => s.value === d.sub_category));
    if (other.length) g.push({ label: '未分类', docs: other });
    return g;
  }, [filteredDocs, selectedTab]);

  const statusBadge = (d: SopListItem) => {
    if (d.ai_status === 'done') return { bg: 'var(--sop-success-bg)', fg: 'var(--sop-success)', text: '已提炼' };
    if (d.ai_status === 'processing')
      return { bg: 'var(--sop-primary-bg)', fg: 'var(--sop-primary)', text: '提炼中' };
    return { bg: 'var(--sop-muted)', fg: 'var(--sop-t3)', text: '资料待补充' };
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/sop/documents/${id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({ success: false }));
    if (!json.success && res.status >= 400) {
      setToast(json.error || '删除失败');
      return;
    }
    const next = allDocs.filter((d) => d.id !== id);
    setAllDocs(next);
    if ((selectedId ?? '') === id) {
      setSelectedId(filteredDocs.find((d) => d.id !== id)?.id ?? null);
    }
    setToast('已删除');
    setTimeout(() => setToast(null), 2500);
  };

  return (
    <div className="sop-scope min-h-screen" style={{ backgroundColor: 'var(--sop-bg)' }}>
      <div className="mx-auto max-w-[1560px] px-5 py-4">
        {/* 顶部工具栏 */}
        <div className="flex h-[52px] items-center justify-between">
          <div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-[20px] font-bold" style={{ color: 'var(--sop-t1)' }}>
                SOP管理
              </h1>
              <span className="text-xs" style={{ color: 'var(--sop-t3)' }}>
                4 条业务线 × 5 个分类 · AI 提炼 · 自动分发
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-[280px] items-center gap-2 rounded-md border px-2.5" style={{ borderColor: 'var(--sop-border)', backgroundColor: 'var(--sop-panel)' }}>
              <Search size={14} style={{ color: 'var(--sop-t3)' }} />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索文档标题 / 提炼关键词"
                className="h-full w-full bg-transparent text-[13px] outline-none"
                style={{ color: 'var(--sop-t1)' }}
              />
            </div>
            {canUpload && (
              <button
                type="button"
                onClick={() => setShowUpload(true)}
                className="flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--sop-primary)' }}
              >
                <PlusIcon size={15} /> 上传内容
              </button>
            )}
            {!canUpload && (
              <span className="text-xs" style={{ color: 'var(--sop-t3)' }}>
                仅「运营 / 项目负责人」可上传更新，其他成员只读
              </span>
            )}
          </div>
        </div>

        {/* 更新流程条 */}
        <div
          className="mt-3 flex items-center justify-center gap-2 rounded-[10px] px-4 py-2.5"
          style={{ backgroundColor: 'var(--sop-flow-bg)', border: '1px solid var(--sop-line)' }}
        >
          <FlowStep n={1} label="上传文档" />
          <FlowArrow />
          <FlowStep n={2} label="AI 自动提炼要点" />
          <FlowArrow />
          <FlowStep n={3} label="自动分发 · 阅读反馈" />
          <span className="ml-4 text-xs" style={{ color: 'var(--sop-t3)' }}>
            仅「运营」「项目负责人」可上传更新；其他成员只读并接收更新提醒
          </span>
        </div>

        {/* 三栏 */}
        <div className="mt-4 grid grid-cols-[196px_600px_1fr] gap-4">
          {/* 左栏 */}
          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--sop-border)', backgroundColor: 'var(--sop-panel)' }}>
            <div className="mb-3 text-[13px] font-semibold" style={{ color: 'var(--sop-t1)' }}>
              一级 · 业务线
            </div>
            <div className="space-y-1">
              {SCOPES.filter((s) => visibleScopes.includes(s.value)).map((s) => {
                const active = s.value === selectedScope;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSelectedScope(s.value)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors"
                    style={{ backgroundColor: active ? 'var(--sop-primary-soft)' : 'transparent' }}
                  >
                    <span className={`h-[9px] w-[9px] shrink-0 rounded-full dot-${s.value}`} />
                    <span className="flex-1">
                      <span className="block text-[14px] font-bold" style={{ color: active ? 'var(--sop-primary)' : 'var(--sop-t1)' }}>
                        {s.label}
                      </span>
                      <span className="block text-[11px]" style={{ color: 'var(--sop-t3)' }}>
                        {s.sub}
                      </span>
                    </span>
                    <span
                      className="flex h-5 min-w-[20px] items-center justify-center rounded px-1 text-xs font-semibold"
                      style={{ backgroundColor: active ? 'var(--sop-panel)' : 'var(--sop-muted)', color: active ? 'var(--sop-primary)' : 'var(--sop-t3)' }}
                    >
                      {scopeCounts[s.value] || 0}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              className="mt-4 border-t pt-3 text-[12px] leading-relaxed"
              style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-t3)' }}
            >
              每条业务线下固定挂 5 个二级分类，文档按运营 / 主播等角色自动分发。
            </div>
          </div>

          {/* 中栏 */}
          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--sop-border)', backgroundColor: 'var(--sop-panel)' }}>
            <div className="mb-3 flex items-center gap-1 border-b" style={{ borderColor: 'var(--sop-border)' }}>
              {[{ value: 'all', label: '全部' }, ...SUBCATS].map((t) => {
                const active = selectedTab === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setSelectedTab(t.value)}
                    className="relative pb-2 pr-4 text-[13px]"
                    style={{
                      color: active ? 'var(--sop-primary)' : 'var(--sop-t3)',
                      fontWeight: active ? 700 : 400,
                    }}
                  >
                    {t.label}
                    <span className="ml-1 text-[11px]" style={{ color: active ? 'var(--sop-primary)' : 'var(--sop-t4)' }}>
                      {tabCounts[t.value] || 0}
                    </span>
                    {active && (
                      <span className="absolute inset-x-0 bottom-[-1px] h-[2px] rounded" style={{ backgroundColor: 'var(--sop-primary)' }} />
                    )}
                  </button>
                );
              })}
            </div>

            {loading ? (
              <p className="py-10 text-center text-sm" style={{ color: 'var(--sop-t3)' }}>
                加载中…
              </p>
            ) : filteredDocs.length === 0 ? (
              <p className="py-10 text-center text-sm" style={{ color: 'var(--sop-t3)' }}>
                暂无文档
              </p>
            ) : selectedTab !== 'all' ? (
              <div className="space-y-2">
                {filteredDocs.map((d) => (
                  <SopCard key={d.id} doc={d} active={activeId === d.id} onSelect={() => setSelectedId(d.id)} statusBadge={statusBadge} />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {grouped.map((g) => (
                  <div key={g.label}>
                    <div className="mb-1.5 text-xs font-semibold" style={{ color: 'var(--sop-t2)' }}>
                      {g.label}
                      <span className="ml-1 font-normal" style={{ color: 'var(--sop-t4)' }}>
                        {g.docs.length} 篇
                      </span>
                    </div>
                    <div className="space-y-2">
                      {g.docs.map((d) => (
                        <SopCard key={d.id} doc={d} active={activeId === d.id} onSelect={() => setSelectedId(d.id)} statusBadge={statusBadge} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 右栏 */}
          <div className="rounded-lg border p-5" style={{ borderColor: 'var(--sop-border)', backgroundColor: 'var(--sop-panel)' }}>
            {selectedDoc ? (
              <SopDocDetailBody doc={selectedDoc as SopDetailDoc} canUpload={canUpload} onDelete={handleDelete} />
            ) : (
              <div className="flex h-full min-h-[400px] items-center justify-center">
                <p style={{ color: 'var(--sop-t4)' }}>请选择左侧文档查看详情</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showUpload && canUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          scopes={visibleScopes}
          onCreated={async () => {
            setShowUpload(false);
            await load();
            setToast('已提交，正在后台提炼');
            setTimeout(() => setToast(null), 2500);
          }}
        />
      )}

      {toast && (
        <div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-md px-4 py-2 text-sm text-white"
          style={{ backgroundColor: 'var(--sop-primary)', zIndex: 60 }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function FlowStep({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ backgroundColor: 'var(--sop-primary)' }}
      >
        {n}
      </span>
      <span className="text-[13px] font-medium" style={{ color: 'var(--sop-t2)' }}>
        {label}
      </span>
    </div>
  );
}

function FlowArrow() {
  return <span className="text-sm font-bold" style={{ color: 'var(--sop-flow-arrow)' }}>→</span>;
}

function SopCard({
  doc,
  active,
  onSelect,
  statusBadge,
}: {
  doc: SopListItem;
  active: boolean;
  onSelect: () => void;
  statusBadge: (d: SopListItem) => { bg: string; fg: string; text: string };
}) {
  const sb = statusBadge(doc);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-md border p-3 text-left transition-all"
      style={{
        borderColor: active ? 'var(--sop-card-border)' : 'var(--sop-border)',
        backgroundColor: active ? 'var(--sop-card-active)' : 'var(--sop-panel)',
        boxShadow: active ? '0 0 8px rgba(22,93,255,0.10)' : 'none',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="truncate text-[14px] font-bold" style={{ color: 'var(--sop-t1)' }}>
          《{doc.title}》
        </span>
        {doc.source_type && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px]" style={{ backgroundColor: 'var(--sop-muted)', color: 'var(--sop-t3)' }}>
            {SOURCE_LABEL[doc.source_type] ?? '文档'}
          </span>
        )}
        {doc.needs_quiz && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ backgroundColor: 'var(--sop-danger-bg)', color: 'var(--sop-danger)' }}>
            需考核
          </span>
        )}
        {doc.ai_status !== 'done' && <span className="ml-auto h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: doc.read ? 'var(--sop-t4)' : 'var(--sop-danger)' }} />}
      </div>
      <div className="mt-1 truncate text-[13px]">
        <span className="font-bold" style={{ color: 'var(--sop-primary)' }}>
          AI 提炼：
        </span>
        {doc.ai_status === 'done' && doc.ai_summary ? (
          <span style={{ color: 'var(--sop-t2)' }}>{doc.ai_summary}</span>
        ) : sb.text === '提炼中' ? (
          <span style={{ color: 'var(--sop-primary)' }}>AI 正在提炼正文，请稍候…</span>
        ) : (
          <span style={{ color: 'var(--sop-t4)' }}>资料待补充</span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[12px]">
        <span className="flex items-center gap-2">
          <span className="rounded px-1.5 py-0.5 font-medium" style={{ backgroundColor: sb.bg, color: sb.fg }}>
            {sb.text}
          </span>
          <span style={{ color: 'var(--sop-t3)' }}>
            {doc.uploader_name || '—'} · {fmtTime(doc.updated_at)}
          </span>
        </span>
        <span style={{ color: sb.text === '已提炼' ? 'var(--sop-success)' : 'var(--sop-t3)' }}>
          {doc.ai_status === 'done' ? doc.sync_status : doc.ai_status === 'processing' ? '待提炼完成后分发' : '未分发'}
        </span>
      </div>
    </button>
  );
}

function UploadModal({
  onClose,
  scopes,
  onCreated,
}: {
  onClose: () => void;
  scopes: string[];
  onCreated: () => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [scope, setScope] = useState(scopes[0] ?? 'general');
  const [subCategory, setSubCategory] = useState('product');
  const [needsQuiz, setNeedsQuiz] = useState(false);
  const [remark, setRemark] = useState('');
  const [manualKeypoints, setManualKeypoints] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const body = {
      title,
      external_url: link,
      scope,
      sub_category: subCategory,
      needs_quiz: needsQuiz,
      remark,
      manual_keypoints: manualKeypoints.split('\n').map((s) => s.trim()).filter(Boolean),
      doc_type: 'training',
    };
    try {
      const res = await fetch('/api/sop/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({ success: false }));
      if (res.status >= 400 || !json.success) {
        setError(json.error || '上传失败');
        return;
      }
      await onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" style={{ backgroundColor: 'rgba(0,0,0,0.30)' }} onClick={onClose}>
      <div
        className="w-[560px] max-h-[86vh] overflow-y-auto rounded-lg p-6"
        style={{ backgroundColor: 'var(--sop-panel)', border: '1px solid var(--sop-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[16px] font-bold" style={{ color: 'var(--sop-t1)' }}>
          上传 SOP 文档
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--sop-t3)' }}>
          仅支持飞书（feishu.cn / larksuite.com）或腾讯文档（docs.qq.com）链接
        </p>

        <label className="mt-4 block text-[13px] font-medium" style={{ color: 'var(--sop-t2)' }}>
          标题 <span style={{ color: 'var(--sop-danger)' }}>*</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-[13px] outline-none"
            style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-t1)', backgroundColor: 'var(--sop-panel)' }}
          />
        </label>

        <label className="mt-3 block text-[13px] font-medium" style={{ color: 'var(--sop-t2)' }}>
          文档链接 <span style={{ color: 'var(--sop-danger)' }}>*</span>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://xxx.feishu.cn/… 或 https://docs.qq.com/…"
            className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-[13px] outline-none"
            style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-t1)', backgroundColor: 'var(--sop-panel)' }}
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-[13px] font-medium" style={{ color: 'var(--sop-t2)' }}>
            一级 · 业务线
            <select value={scope} onChange={(e) => setScope(e.target.value)} className="mt-1 w-full rounded-md border px-2 py-1.5 text-[13px] outline-none" style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-t1)', backgroundColor: 'var(--sop-panel)' }}>
              {SCOPES.filter((s) => scopes.includes(s.value)).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[13px] font-medium" style={{ color: 'var(--sop-t2)' }}>
            二级 · 分类
            <select value={subCategory} onChange={(e) => setSubCategory(e.target.value)} className="mt-1 w-full rounded-md border px-2 py-1.5 text-[13px] outline-none" style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-t1)', backgroundColor: 'var(--sop-panel)' }}>
              {SUBCATS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 flex items-center gap-2 text-[13px]" style={{ color: 'var(--sop-t2)' }}>
          <input type="checkbox" checked={needsQuiz} onChange={(e) => setNeedsQuiz(e.target.checked)} />
          该文档后续需要考核
        </label>

        <label className="mt-3 block text-[13px] font-medium" style={{ color: 'var(--sop-t2)' }}>
          备注（可选）
          <textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-[13px] outline-none" style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-t1)', backgroundColor: 'var(--sop-panel)' }} />
        </label>

        <label className="mt-3 block text-[13px] font-medium" style={{ color: 'var(--sop-t2)' }}>
          手动补充要点（可选，逐行一条，用于腾讯文档等抓不到正文的场景兜底）
          <textarea value={manualKeypoints} onChange={(e) => setManualKeypoints(e.target.value)} rows={3} className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-[13px] outline-none" style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-t1)', backgroundColor: 'var(--sop-panel)' }} />
        </label>

        {error && (
          <p className="mt-3 text-[13px]" style={{ color: 'var(--sop-danger)' }}>
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-1.5 text-sm" style={{ backgroundColor: 'var(--sop-muted)', color: 'var(--sop-t2)' }}>
            取消
          </button>
          <button
            type="button"
            disabled={submitting || !title || !link}
            onClick={submit}
            className="rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--sop-primary)' }}
          >
            {submitting ? '提交中…' : '确认上传'}
          </button>
        </div>
      </div>
    </div>
  );
}