'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PlusIcon, Search, Trash2, X, Save, RefreshCw, FileText, File as FileIcon, UploadCloud } from 'lucide-react';
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
  ai_error: string | null;
  uploader_name: string | null;
  version: number;
  updated_at: string | null;
  synced_count: number;
  sync_detail: string;
  sync_status: string;
  read: boolean;
  file_kind?: string | null;
  file_name?: string | null;
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

const SOURCE_LABEL: Record<string, string> = { feishu: '飞书', tencent: '腾讯文档', file: '本地上传' };

// 上传文件白名单（扩展名）与大小限制（与服务端一致）
const FILE_EXT_RE = /\.(pdf|doc|docx|ppt|pptx|txt|md|png|jpe?g|gif|webp|bmp|svg)$/i;
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const FILE_KIND: Record<string, string> = {
  pdf: 'pdf', doc: 'word', docx: 'word', ppt: 'ppt', pptx: 'ppt',
  txt: 'text', md: 'text', png: 'image', jpg: 'image', jpeg: 'image',
  gif: 'image', webp: 'image', bmp: 'image', svg: 'image',
};

// 批量上传草稿：文件项（File 句柄仅在内存会话内有效，刷新后需重新选择）
export interface SopUploadFileItem {
  uid: string;
  file: File | null;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  title: string;
  needsReselect: boolean;
  status: 'pending' | 'uploading' | 'success' | 'failed';
  error?: string;
}

export interface SopUploadDraft {
  mode: 'link' | 'file';
  title: string;
  link: string;
  scope: string;
  subCategory: string;
  needsQuiz: boolean;
  remark: string;
  manualKeypoints: string;
  mergeImages: boolean;
  files: SopUploadFileItem[];
}

const DRAFT_KEY = 'blue_sop_upload_draft';
const MAX_FILES = 20;

// localStorage 仅持久化可序列化元数据（File 对象无法序列化）
interface SopUploadDraftMeta {
  mode: 'link' | 'file';
  title: string;
  link: string;
  scope: string;
  subCategory: string;
  needsQuiz: boolean;
  remark: string;
  manualKeypoints: string;
  mergeImages: boolean;
  files: Array<Pick<SopUploadFileItem, 'uid' | 'name' | 'size' | 'type' | 'lastModified' | 'title'>>;
}

function stripToMeta(d: SopUploadDraft): SopUploadDraftMeta {
  return {
    mode: d.mode,
    title: d.title,
    link: d.link,
    scope: d.scope,
    subCategory: d.subCategory,
    needsQuiz: d.needsQuiz,
    remark: d.remark,
    manualKeypoints: d.manualKeypoints,
    mergeImages: d.mergeImages,
    files: d.files.map((f) => ({ uid: f.uid, name: f.name, size: f.size, type: f.type, lastModified: f.lastModified, title: f.title })),
  };
}

function metaToDraft(m: SopUploadDraftMeta): SopUploadDraft {
  return {
    ...m,
    files: m.files.map((f) => ({ ...f, file: null, needsReselect: true, status: 'pending' as const })),
  };
}

function saveDraftMeta(d: SopUploadDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(stripToMeta(d)));
  } catch {
    /* 忽略存储失败 */
  }
}

function loadDraftMeta(): SopUploadDraftMeta | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SopUploadDraftMeta;
    if (typeof parsed.mode !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearDraftMeta() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

let uidCounter = 0;
function genUid(): string {
  uidCounter += 1;
  return `${Date.now().toString(36)}-${uidCounter}`;
}

function stripExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function SopPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [allDocs, setAllDocs] = useState<SopListItem[]>([]);
  const [visibleScopes, setVisibleScopes] = useState<string[]>(['general']);
  const [canUpload, setCanUpload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedScope, setSelectedScope] = useState<string>('general');
  const [selectedTab, setSelectedTab] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SopListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // 上传草稿：持于父级以便同会话关闭/重开完整恢复（File 句柄随内存保留）
  const [uploadDraft, setUploadDraft] = useState<SopUploadDraft | null>(null);
  const draftSavedRef = useRef(false);

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  // 初始打开：若内存无草稿，尝试从 localStorage 恢复（刷新后 File 丢失 → 需重选）
  const openUpload = () => {
    if (!uploadDraft) {
      const meta = loadDraftMeta();
      if (meta) {
        draftSavedRef.current = true;
        setUploadDraft(metaToDraft(meta));
      } else {
        setUploadDraft({
          mode: 'file',
          title: '',
          link: '',
          scope: visibleScopes[0] ?? 'general',
          subCategory: 'product',
          needsQuiz: false,
          remark: '',
          manualKeypoints: '',
          mergeImages: false,
          files: [],
        });
      }
    }
    setShowUpload(true);
  };

  const closeUpload = () => setShowUpload(false);

  const discardDraft = () => {
    clearDraftMeta();
    draftSavedRef.current = false;
    setUploadDraft(null);
    setShowUpload(false);
  };

  const saveDraft = (d: SopUploadDraft) => {
    setUploadDraft(d);
    draftSavedRef.current = true;
    saveDraftMeta(d);
    notify('已保存，可随时继续');
  };

  const handleCreated = async () => {
    clearDraftMeta();
    draftSavedRef.current = false;
    setUploadDraft(null);
    setShowUpload(false);
    await load();
    notify('已提交，正在后台提炼');
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sop/documents');
      const json = (await res.json()) as ListResp;
      setAllDocs(json.docs ?? []);
      setVisibleScopes(json.scopes?.length ? json.scopes : ['general']);
      setCanUpload(!!json.canUpload);
      const sp = searchParams.get('scope');
      const tab = searchParams.get('category');
      const ok = sp && json.scopes?.includes(sp);
      setSelectedScope((prev) => (ok ? sp : json.scopes?.includes(prev) ? prev : json.scopes?.[0] || 'general'));
      if (tab && (tab === 'all' || SUBCATS.some((s) => s.value === tab))) setSelectedTab(tab);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Tab=全部时按二级类目分组
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
    if (d.ai_status === 'processing') return { bg: 'var(--sop-primary-bg)', fg: 'var(--sop-primary)', text: '提炼中' };
    return { bg: 'var(--sop-muted)', fg: 'var(--sop-t3)', text: '资料待补充' };
  };

  const openDoc = (d: SopListItem) => {
    router.push(`/sop/doc/${d.id}?scope=${encodeURIComponent(selectedScope)}&category=${encodeURIComponent(selectedTab)}`);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/sop/documents/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({ success: false }));
      if (!json.success && res.status >= 400) {
        setToast(json.error || '删除失败');
      } else {
        setAllDocs((prev) => prev.filter((d) => d.id !== deleteTarget.id));
        setToast('已删除');
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
      setTimeout(() => setToast(null), 2500);
    }
  };

  const renderCard = (d: SopListItem) => (
    <SopCard key={d.id} doc={d} canDelete={canUpload} onDelete={() => setDeleteTarget(d)} onOpen={() => openDoc(d)} statusBadge={statusBadge} />
  );

  return (
    <div className="sop-scope min-h-screen" style={{ backgroundColor: 'var(--sop-bg)' }}>
      <div className="mx-auto max-w-[1560px] px-5 py-4">
        {/* 顶部工具栏 */}
        <div className="flex h-[52px] items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="text-[20px] font-bold" style={{ color: 'var(--sop-t1)' }}>
              SOP管理
            </h1>
            <span className="text-xs" style={{ color: 'var(--sop-t3)' }}>
              4 条业务线 × 5 个分类 · AI 提炼 · 自动分发
            </span>
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
            {canUpload ? (
              <button
                type="button"
                onClick={openUpload}
                className="flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--sop-primary)' }}
              >
                <PlusIcon size={15} /> 上传内容
              </button>
            ) : (
              <span className="text-xs" style={{ color: 'var(--sop-t3)' }}>
                仅「运营 / 项目负责人」可上传更新，其他成员只读
              </span>
            )}
          </div>
        </div>

        {/* 更新流程条 */}
        <div className="mt-3 flex items-center justify-center gap-2 rounded-[10px] px-4 py-2.5" style={{ backgroundColor: 'var(--sop-flow-bg)', border: '1px solid var(--sop-line)' }}>
          <FlowStep n={1} label="上传文档" />
          <FlowArrow />
          <FlowStep n={2} label="AI 自动提炼要点" />
          <FlowArrow />
          <FlowStep n={3} label="自动分发 · 阅读反馈" />
          <span className="ml-4 text-xs" style={{ color: 'var(--sop-t3)' }}>
            仅「运营」「项目负责人」可上传更新；其他成员只读并接收更新提醒
          </span>
        </div>

        {/* 两栏：左业务线 232 + 右区 */}
        <div className="mt-4 grid grid-cols-[232px_1fr] gap-4">
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
                    onClick={() => {
                      setSelectedScope(s.value);
                      setSelectedTab('all');
                      setKeyword('');
                    }}
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
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded px-1 text-xs font-semibold" style={{ backgroundColor: active ? 'var(--sop-panel)' : 'var(--sop-muted)', color: active ? 'var(--sop-primary)' : 'var(--sop-t3)' }}>
                      {scopeCounts[s.value] || 0}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 border-t pt-3 text-[12px] leading-relaxed" style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-t3)' }}>
              每条业务线下固定挂 5 个二级分类，文档按运营 / 主播等角色自动分发。
            </div>
          </div>

          {/* 右区 */}
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-1 border-b" style={{ borderColor: 'var(--sop-border)' }}>
              {[{ value: 'all', label: '全部' }, ...SUBCATS].map((t) => {
                const active = selectedTab === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setSelectedTab(t.value)}
                    className="relative pb-2 pr-4 text-[13px]"
                    style={{ color: active ? 'var(--sop-primary)' : 'var(--sop-t3)', fontWeight: active ? 700 : 400 }}
                  >
                    {t.label}
                    <span className="ml-1 text-[11px]" style={{ color: active ? 'var(--sop-primary)' : 'var(--sop-t4)' }}>
                      {tabCounts[t.value] || 0}
                    </span>
                    {active && <span className="absolute inset-x-0 bottom-0 h-0.5" style={{ backgroundColor: 'var(--sop-primary)' }} />}
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
              <div className="grid grid-cols-2 gap-4">{filteredDocs.map(renderCard)}</div>
            ) : (
              <div className="space-y-4">
                {grouped.map((g) => (
                  <div key={g.label}>
                    <div className="mb-2 flex items-center gap-2" style={{ color: 'var(--sop-t2)' }}>
                      <span className="text-xs font-semibold">{g.label}</span>
                      <span className="text-xs" style={{ color: 'var(--sop-t4)' }}>
                        {g.docs.length} 篇
                      </span>
                      <span className="h-px flex-1" style={{ backgroundColor: 'var(--sop-split)' }} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">{g.docs.map(renderCard)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showUpload && canUpload && uploadDraft && (
        <UploadModal
          draft={uploadDraft}
          onDraftChange={setUploadDraft}
          onSave={saveDraft}
          onClose={closeUpload}
          onDiscard={discardDraft}
          onCreated={handleCreated}
          scopes={visibleScopes}
          draftSaved={draftSavedRef.current}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" style={{ backgroundColor: 'rgba(0,0,0,0.30)' }} onClick={() => setDeleteTarget(null)}>
          <div
            className="w-[440px] rounded-lg p-6"
            style={{ backgroundColor: 'var(--sop-panel)', border: '1px solid var(--sop-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-bold" style={{ color: 'var(--sop-t1)' }}>
              确认删除文档
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--sop-t2)' }}>
              删除「{deleteTarget.title}」后，该业务线相关人员将不再看到此文档，确认删除？
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-md px-4 py-1.5 text-sm" style={{ backgroundColor: 'var(--sop-muted)', color: 'var(--sop-t2)' }}>
                取消
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDelete}
                className="rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: 'var(--sop-danger)' }}
              >
                {deleting ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-md px-4 py-2 text-sm text-white" style={{ backgroundColor: 'var(--sop-primary)', zIndex: 60 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

export default function SopPage() {
  return (
    <Suspense fallback={null}>
      <SopPageInner />
    </Suspense>
  );
}

function FlowStep({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: 'var(--sop-primary)' }}>
        {n}
      </span>
      <span className="text-[13px] font-medium" style={{ color: 'var(--sop-t2)' }}>
        {label}
      </span>
    </div>
  );
}

function FlowArrow() {
  return (
    <span className="text-sm font-bold" style={{ color: 'var(--sop-flow-arrow)' }}>
      →
    </span>
  );
}

function SopCard({
  doc,
  canDelete,
  onDelete,
  onOpen,
  statusBadge,
}: {
  doc: SopListItem;
  canDelete: boolean;
  onDelete: () => void;
  onOpen: () => void;
  statusBadge: (d: SopListItem) => { bg: string; fg: string; text: string };
}) {
  const sb = statusBadge(doc);
  return (
    <div
      onClick={onOpen}
      className="group relative cursor-pointer rounded-lg border p-4 transition-all"
      style={{
        borderColor: 'var(--sop-border)',
        backgroundColor: 'var(--sop-panel)',
        boxShadow: '0 1px 4px rgba(29,33,41,0.04)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--sop-card-border)';
        e.currentTarget.style.boxShadow = '0 0 10px rgba(22,93,255,0.10)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--sop-border)';
        e.currentTarget.style.boxShadow = '0 1px 4px rgba(29,33,41,0.04)';
      }}
    >
      {canDelete && (
        <button
          type="button"
          aria-label="删除文档"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute right-2.5 top-2.5 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
          title="删除"
          style={{ color: 'var(--sop-danger)' }}
        >
          <Trash2 size={15} />
        </button>
      )}
      <div className="flex items-center gap-2">
        <span className="truncate text-[15px] font-bold" style={{ color: 'var(--sop-t1)' }}>
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
      </div>
      <div className="mt-1.5 truncate text-[13px]" style={{ paddingRight: canDelete ? 22 : 0 }}>
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
      <div className="mt-2 flex items-center justify-between text-[12px]">
        <span className="flex items-center gap-2">
          <span className="rounded px-1.5 py-0.5 font-medium" style={{ backgroundColor: sb.bg, color: sb.fg }}>
            {sb.text}
          </span>
          <span style={{ color: 'var(--sop-t3)' }}>
            {doc.uploader_name || '—'} · {fmtTime(doc.updated_at)}
          </span>
        </span>
        {doc.ai_status === 'done' ? (
          <span className="font-medium" style={{ color: 'var(--sop-primary)' }}>
            查看正式内容 →
          </span>
        ) : (
          <span style={{ color: 'var(--sop-t3)' }}>{doc.ai_status === 'processing' ? '待提炼完成后分发' : '未分发'}</span>
        )}
      </div>
    </div>
  );
}

function FileThumb({ it, onPreview, className }: { it: SopUploadFileItem; onPreview: () => void; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const ext = (it.name.split('.').pop() || '').toLowerCase();
  const isImage = FILE_KIND[ext] === 'image';
  useEffect(() => {
    if (it.file && isImage) {
      const u = URL.createObjectURL(it.file);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    setUrl(null);
  }, [it.file, isImage]);
  if (url && it.file) {
    return (
      <img
        src={url}
        alt={it.name}
        className={className ?? 'h-10 w-10 shrink-0 cursor-zoom-in rounded border object-cover'}
        style={{ borderColor: 'var(--sop-border)' }}
        onClick={(e) => { e.stopPropagation(); onPreview(); }}
      />
    );
  }
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded border"
      style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-primary)', backgroundColor: isImage ? 'var(--sop-primary-bg)' : 'var(--sop-muted)' }}
    >
      {ext === 'pdf' ? <FileText size={20} /> : <FileIcon size={20} />}
    </span>
  );
}

function UploadModal({
  draft,
  onDraftChange,
  onSave,
  onClose,
  onDiscard,
  onCreated,
  scopes,
  draftSaved,
}: {
  draft: SopUploadDraft;
  onDraftChange: (d: SopUploadDraft) => void;
  onSave: (d: SopUploadDraft) => void;
  onClose: () => void;
  onDiscard: () => void;
  onCreated: () => Promise<void>;
  scopes: string[];
  draftSaved: boolean;
}) {
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [showPreview, setShowPreview] = useState<SopUploadFileItem | null>(null);

  const mode = draft.mode;
  const files = draft.files;
  const multi = mode === 'file' && files.length > 1;
  const hasContent =
    mode === 'file'
      ? files.length > 0 || !!draft.title.trim() || !!draft.remark.trim() || !!draft.manualKeypoints.trim() || draft.needsQuiz
      : !!(draft.title.trim() || draft.link.trim() || draft.remark.trim() || draft.manualKeypoints.trim());
  const restored = useState(() => files.length > 0)[0]; // 仅当打开时已有草稿文件才提示「已恢复」
  const anyNeedsReselect = files.some((f) => f.needsReselect && !f.file);
  const doneCount = files.filter((f) => f.status === 'success' || f.status === 'failed').length;
  const canSubmit =
    mode === 'file'
      ? files.length > 0 && !anyNeedsReselect && !submitting && (!draft.mergeImages || (files.some((f) => /\.(jpe?g|png)$/i.test(f.name)) ? !!draft.title.trim() : true))
      : !!draft.title.trim() && !!draft.link.trim() && !submitting;

  const setMode = (m: 'link' | 'file') => {
    setError(null);
    setNotice(null);
    onDraftChange({ ...draftRef.current, mode: m });
  };

  const update = (patch: Partial<SopUploadDraft>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    onDraftChange(next);
  };

  const setItemStatus = (uid: string, status: SopUploadFileItem['status'], err?: string) => {
    const cur = draftRef.current;
    const next = { ...cur, files: cur.files.map((f) => (f.uid === uid ? { ...f, status, error: err } : f)) };
    draftRef.current = next;
    onDraftChange(next);
  };

  const addFiles = (incoming: File[]) => {
    if (!incoming.length) return;
    setError(null);
    const skips: string[] = [];
    const cur = draftRef.current;
    const items = [...cur.files];
    for (const f of incoming) {
      if (items.length >= MAX_FILES) {
        skips.push(`单次最多 ${MAX_FILES} 个文件，已达上限，其余已忽略`);
        break;
      }
      const dup = items.some(
        (i) => i.name === f.name && i.size === f.size && i.lastModified === f.lastModified,
      );
      if (dup) {
        skips.push(`「${f.name}」重复，已忽略`);
        continue;
      }
      if (!/\.(pdf|doc|docx|ppt|pptx|txt|md|png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name)) {
        skips.push(`「${f.name}」类型不支持，已忽略`);
        continue;
      }
      const ext = (f.name.split('.').pop() || 'txt').toLowerCase();
      const isImage = FILE_KIND[ext] === 'image';
      const limit = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
      if (f.size > limit) {
        skips.push(`「${f.name}」超限（${isImage ? '图片 ≤10MB' : '文档 ≤30MB'}），已忽略`);
        continue;
      }
      items.push({
        uid: genUid(),
        file: f,
        name: f.name,
        size: f.size,
        type: f.type,
        lastModified: f.lastModified,
        title: stripExt(f.name),
        needsReselect: false,
        status: 'pending',
      });
    }
    const next = { ...cur, files: items };
    // 单文件时回填主标题
    if (items.length === 1 && !cur.title.trim()) next.title = stripExt(items[0].name);
    draftRef.current = next;
    onDraftChange(next);
    if (skips.length) setNotice(skips.join('；'));
  };

  const removeItem = (uid: string) => {
    const cur = draftRef.current;
    const filesNext = cur.files.filter((f) => f.uid !== uid);
    const next = { ...cur, files: filesNext };
    draftRef.current = next;
    onDraftChange(next);
  };

  const reselectItem = (uid: string, f: File) => {
    if (!/\.(pdf|doc|docx|ppt|pptx|txt|md|png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name)) {
      setError(`「${f.name}」类型不支持`);
      return;
    }
    const cur = draftRef.current;
    const next = {
      ...cur,
      files: cur.files.map((it) =>
        it.uid === uid
          ? { ...it, file: f, name: f.name, size: f.size, type: f.type, lastModified: f.lastModified, needsReselect: false, error: undefined }
          : it,
      ),
    };
    draftRef.current = next;
    onDraftChange(next);
  };

  // 是否可转 PDF 的图片（jpg/jpeg/png）
  const isImgConvertible = (name: string) => /\.(jpe?g|png)$/i.test(name);

  // 逐文件并发上传（保留进度与单项状态，失败可重试，不中断其余）
  const submit = async () => {
    setError(null);
    setSubmitting(true);
    const cur = draftRef.current;
    if (mode === 'file') {
      // 合并模式：把尚未成功的可转图片筛出，其余仍逐文件独立上传
      const mergeImgs = cur.mergeImages
        ? cur.files.filter((f) => f.status !== 'success' && isImgConvertible(f.name))
        : [];
      const queue = cur.files.filter((f) => f.status !== 'success' && !mergeImgs.some((m) => m.uid === f.uid));
      setItemStatusAll([
        ...queue.map((f) => ({ uid: f.uid, status: 'pending' as const })),
        ...mergeImgs.map((f) => ({ uid: f.uid, status: 'pending' as const })),
      ]);
      const CONCURRENCY = 3;
      let idx = 0;
      const runOne = async (item: SopUploadFileItem) => {
        setItemStatus(item.uid, 'uploading');
        try {
          if (!item.file) {
            setItemStatus(item.uid, 'failed', 'File 已丢失，需重新选择');
            return;
          }
          const fd = new FormData();
          fd.append('title', item.title && item.title.trim() ? item.title.trim() : item.name);
          fd.append('scope', cur.scope);
          fd.append('sub_category', cur.subCategory);
          fd.append('needs_quiz', cur.needsQuiz ? 'true' : 'false');
          fd.append('remark', cur.remark);
          fd.append('doc_type', 'training');
          fd.append('file', item.file);
          const res = await fetch('/api/sop/documents', { method: 'POST', body: fd });
          const json = (await res.json().catch(() => ({ success: false }))) as { success?: boolean; error?: string };
          if (res.status >= 400 || !json.success) throw new Error(json.error || '上传失败');
          setItemStatus(item.uid, 'success');
        } catch (e) {
          setItemStatus(item.uid, 'failed', e instanceof Error ? e.message : '上传失败');
        }
      };
      // 合并请求：所有可转图片放一个 FormData，merge_images=true，仅生成 1 条文档
      const runMerge = async () => {
        const ok = mergeImgs.filter((i) => i.file);
        if (!ok.length) return;
        ok.forEach((i) => setItemStatus(i.uid, 'uploading'));
        try {
          const fd = new FormData();
          const baseTitle = cur.title && cur.title.trim() ? cur.title.trim() : `多图合并 ${ok.length}P`;
          fd.append('title', baseTitle);
          fd.append('scope', cur.scope);
          fd.append('sub_category', cur.subCategory);
          fd.append('needs_quiz', cur.needsQuiz ? 'true' : 'false');
          fd.append('remark', cur.remark);
          fd.append('doc_type', 'training');
          fd.append('merge_images', 'true');
          ok.forEach((i) => i.file && fd.append('file', i.file as File));
          const res = await fetch('/api/sop/documents', { method: 'POST', body: fd });
          const json = (await res.json().catch(() => ({ success: false }))) as { success?: boolean; error?: string };
          if (res.status >= 400 || !json.success) throw new Error(json.error || '上传失败');
          ok.forEach((i) => setItemStatus(i.uid, 'success'));
        } catch (e) {
          const msg = e instanceof Error ? e.message : '上传失败';
          ok.forEach((i) => setItemStatus(i.uid, 'failed', msg));
        }
      };
      const jobs: Array<() => Promise<void>> = [
        ...Array.from({ length: Math.min(CONCURRENCY, queue.length) }).map(() => async () => {
          while (idx < queue.length) {
            const item = queue[idx];
            idx += 1;
            await runOne(item);
          }
        }),
        async () => { await runMerge(); },
      ];
      await Promise.all(jobs.map((j) => j()));
      setSubmitting(false);
      const final = draftRef.current;
      if (final.files.length > 0 && final.files.every((f) => f.status === 'success')) {
        await onCreated();
      }
    } else {
      const body = {
        title: draft.title,
        external_url: draft.link,
        scope: draft.scope,
        sub_category: draft.subCategory,
        needs_quiz: draft.needsQuiz,
        remark: draft.remark,
        manual_keypoints: draft.manualKeypoints.split('\n').map((s) => s.trim()).filter(Boolean),
        doc_type: 'training',
      };
      try {
        const res = await fetch('/api/sop/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const json = (await res.json().catch(() => ({ success: false }))) as { success?: boolean; error?: string };
        if (res.status >= 400 || !json.success) {
          setError(json.error || '上传失败');
        } else {
          await onCreated();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '上传失败');
      } finally {
        setSubmitting(false);
      }
    }
  };

  const setItemStatusAll = (list: Array<{ uid: string; status: SopUploadFileItem['status'] }>) => {
    const cur = draftRef.current;
    const next = { ...cur, files: cur.files.map((f) => (list.find((x) => x.uid === f.uid) ? { ...f, status: list.find((x) => x.uid === f.uid)!.status } : f)) };
    draftRef.current = next;
    onDraftChange(next);
  };

  const requestClose = () => {
    if (hasContent) setConfirmClose(true);
    else closeFinalize();
  };

  const closeFinalize = () => {
    setConfirmClose(false);
    if (draftSaved) onClose();
    else onDiscard();
  };

  // Esc 不关闭；仅主动关闭按钮可用
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const ext = (name: string) => (name.split('.').pop() || '').toLowerCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.30)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="relative w-[608px] max-h-[88vh] overflow-y-auto rounded-lg p-6"
        style={{ backgroundColor: 'var(--sop-panel)', border: '1px solid var(--sop-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 右上角关闭 X（主动关闭） */}
        <button
          type="button"
          aria-label="关闭"
          onClick={requestClose}
          className="absolute right-3 top-3 rounded p-1.5 transition-colors"
          style={{ color: 'var(--sop-t3)' }}
          title="关闭"
        >
          <X size={18} />
        </button>

        <h3 className="text-[16px] font-bold" style={{ color: 'var(--sop-t1)' }}>
          上传 SOP 文档
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--sop-t3)' }}>
          支持在线链接（飞书 / 腾讯文档）或本地文件批量上传（PDF / Word / PPT / txt / md / 图片）
        </p>

        {/* 恢复草稿提示 */}
        {restored && (
          <div
            className="mt-3 flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"
            style={{ borderColor: 'var(--sop-primary-line, var(--sop-border))', backgroundColor: 'var(--sop-primary-bg)' }}
          >
            <span style={{ color: 'var(--sop-t2)' }}>
              已恢复上次未完成的上传（{files.length} 个文件）
              {anyNeedsReselect ? ' · 部分文件需重新选择' : ''}
            </span>
            <button
              type="button"
              onClick={onDiscard}
              className="shrink-0 rounded px-2 py-0.5 text-xs font-medium transition-colors"
              style={{ border: '1px solid var(--sop-danger)', color: 'var(--sop-danger)' }}
            >
              放弃草稿
            </button>
          </div>
        )}

        <div className="mt-3 flex gap-1 rounded-md p-1" style={{ backgroundColor: 'var(--sop-muted)' }}>
          {(['link', 'file'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className="flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors"
              style={
                mode === m
                  ? { backgroundColor: 'var(--sop-panel)', color: 'var(--sop-primary)', boxShadow: '0 0 0 1px var(--sop-border)' }
                  : { color: 'var(--sop-t2)' }
              }
            >
              {m === 'link' ? '在线链接' : '本地文件'}
            </button>
          ))}
        </div>

        {mode === 'link' ? (
          <>
            <label className="mt-4 block text-[13px] font-medium" style={{ color: 'var(--sop-t2)' }}>
              标题 <span style={{ color: 'var(--sop-danger)' }}>*</span>
              <input
                value={draft.title}
                onChange={(e) => update({ title: e.target.value })}
                className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-[13px] outline-none"
                style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-t1)', backgroundColor: 'var(--sop-panel)' }}
              />
            </label>
            <label className="mt-3 block text-[13px] font-medium" style={{ color: 'var(--sop-t2)' }}>
              文档链接 <span style={{ color: 'var(--sop-danger)' }}>*</span>
              <input
                value={draft.link}
                onChange={(e) => update({ link: e.target.value })}
                placeholder="https://xxx.feishu.cn/… 或 https://docs.qq.com/…"
                className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-[13px] outline-none"
                style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-t1)', backgroundColor: 'var(--sop-panel)' }}
              />
            </label>
          </>
        ) : multi ? (
          <div className="mt-4 space-y-2">
            <p className="text-[13px]" style={{ color: 'var(--sop-t3)' }}>
              将分别创建 <b style={{ color: 'var(--sop-primary)' }}>{files.length}</b> 条文档，标题可在下方逐个修改，公共信息批量应用。
            </p>
            {/* 多图合并为一个 PDF 勾选（仅当有可转图片 jpg/jpeg/png 时才展示） */}
            {files.some((f) => /\.(jpe?g|png)$/i.test(f.name)) ? (
              <label
                className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[13px]"
                style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-t2)' }}
              >
                <input
                  type="checkbox"
                  checked={!!draft.mergeImages}
                  onChange={(e) => update({ mergeImages: e.target.checked })}
                  className="h-4 w-4 accent-[var(--sop-primary)]"
                />
                <span>
                  将全部图片合并为一个 PDF（多页）：只生成 <b style={{ color: 'var(--sop-primary)' }}>1</b> 条文档
                </span>
              </label>
            ) : null}
            {draft.mergeImages ? (
              <label className="block text-[13px] font-medium" style={{ color: 'var(--sop-t2)' }}>
                合并文档标题 <span style={{ color: 'var(--sop-danger)' }}>*</span>
                <input
                  value={draft.title}
                  onChange={(e) => update({ title: e.target.value })}
                  placeholder="多图合并文档的标题"
                  className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-[13px] outline-none"
                  style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-t1)', backgroundColor: 'var(--sop-panel)' }}
                />
              </label>
            ) : null}
          </div>
        ) : files.length === 1 ? (
          <label className="mt-4 block text-[13px] font-medium" style={{ color: 'var(--sop-t2)' }}>
            标题 <span style={{ color: 'var(--sop-danger)' }}>*</span>
            <input
              value={draft.title}
              onChange={(e) => update({ title: e.target.value })}
              className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-[13px] outline-none"
              style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-t1)', backgroundColor: 'var(--sop-panel)' }}
            />
          </label>
        ) : (
          <div className="mt-4" />
        )}

        {/* 文件选择 / 拖拽追加 */}
        {(mode === 'file' || files.length > 0) && (
          <div
            className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center transition-colors"
            style={{
              borderColor: dragOver ? 'var(--sop-primary)' : 'var(--sop-border)',
              backgroundColor: dragOver ? 'var(--sop-primary-bg, var(--sop-muted))' : 'transparent',
              color: 'var(--sop-t2)',
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files || [])); }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg"
              className="hidden"
              onChange={(e) => {
                addFiles(Array.from(e.target.files || []));
                e.target.value = '';
              }}
            />
            <UploadCloud size={22} style={{ color: 'var(--sop-primary)' }} />
            <p className="text-[13px] font-medium" style={{ color: 'var(--sop-t1)' }}>
              {files.length ? '点击或拖拽继续添加文件（可多选）' : '点击选择或拖拽文件到此处（可多选）'}
            </p>
            <p className="text-xs" style={{ color: 'var(--sop-t3)' }}>
              PDF / Word / PPT / txt / md · 图片（png / jpg / gif / webp / bmp / svg）· 单次最多 {MAX_FILES} 个
            </p>
          </div>
        )}

        {/* 文件列表 */}
        {mode === 'file' && files.length > 0 && (
          <div className="mt-3 space-y-2">
            {files.map((it) => (
              <div
                key={it.uid}
                className="flex items-center gap-2 rounded-md border px-2.5 py-2"
                style={{ borderColor: it.status === 'failed' ? 'var(--sop-danger-line, var(--sop-border))' : 'var(--sop-border)', backgroundColor: 'var(--sop-muted-soft, var(--sop-panel))' }}
              >
                <FileThumb it={it} onPreview={() => setShowPreview(it)} />
                <div className="min-w-0 flex-1">
                  {it.needsReselect && !it.file ? (
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium" style={{ color: 'var(--sop-t1)' }}>
                        {it.name}
                      </span>
                      <span className="rounded px-1.5 py-0.5 text-[11px]" style={{ backgroundColor: 'var(--sop-danger-bg)', color: 'var(--sop-danger)' }}>
                        需重新选择
                      </span>
                      <label
                        className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium"
                        style={{ backgroundColor: 'var(--sop-primary-bg)', color: 'var(--sop-primary)', cursor: 'pointer' }}
                      >
                        选择文件
                        <input
                          type="file"
                          className="hidden"
                          accept={it.name.split('.').pop() ? `.${ext(it.name)}` : undefined}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) reselectItem(it.uid, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <input
                      value={it.title}
                      onChange={(e) => {
                        const next = { ...draftRef.current, files: draftRef.current.files.map((f) => (f.uid === it.uid ? { ...f, title: e.target.value } : f)) };
                        draftRef.current = next;
                        onDraftChange(next);
                      }}
                      placeholder={it.name}
                      className="w-full truncate rounded border-none bg-transparent text-[13px] font-medium outline-none"
                      style={{ color: 'var(--sop-t1)' }}
                    />
                  )}
                  <div className="mt-0.5 flex items-center gap-2 text-[11px]" style={{ color: 'var(--sop-t3)' }}>
                    <span className="truncate">{it.name}</span>
                    <span>{formatBytes(it.size)}</span>
                    {it.status === 'uploading' && <span style={{ color: 'var(--sop-primary)' }}>上传中…</span>}
                    {it.status === 'success' && <span style={{ color: 'var(--sop-success)' }}>成功</span>}
                    {it.status === 'failed' && <span style={{ color: 'var(--sop-danger)' }}>失败：{it.error || '未知错误'}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`移除 ${it.name}`}
                  onClick={() => removeItem(it.uid)}
                  className="shrink-0 rounded p-1 transition-colors"
                  style={{ color: 'var(--sop-t3)' }}
                  title="移除"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 公共字段 */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-[13px] font-medium" style={{ color: 'var(--sop-t2)' }}>
            一级 · 业务线
            <select value={draft.scope} onChange={(e) => update({ scope: e.target.value })} className="mt-1 w-full rounded-md border px-2 py-1.5 text-[13px] outline-none" style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-t1)', backgroundColor: 'var(--sop-panel)' }}>
              {SCOPES.filter((s) => scopes.includes(s.value)).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[13px] font-medium" style={{ color: 'var(--sop-t2)' }}>
            二级 · 分类
            <select value={draft.subCategory} onChange={(e) => update({ subCategory: e.target.value })} className="mt-1 w-full rounded-md border px-2 py-1.5 text-[13px] outline-none" style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-t1)', backgroundColor: 'var(--sop-panel)' }}>
              {SUBCATS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 flex items-center gap-2 text-[13px]" style={{ color: 'var(--sop-t2)' }}>
          <input type="checkbox" checked={draft.needsQuiz} onChange={(e) => update({ needsQuiz: e.target.checked })} />
          该文档后续需要考核
        </label>

        <label className="mt-3 block text-[13px] font-medium" style={{ color: 'var(--sop-t2)' }}>
          备注（可选，批量应用）
          <textarea value={draft.remark} onChange={(e) => update({ remark: e.target.value })} rows={2} className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-[13px] outline-none" style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-t1)', backgroundColor: 'var(--sop-panel)' }} />
        </label>

        {mode === 'link' && (
          <label className="mt-3 block text-[13px] font-medium" style={{ color: 'var(--sop-t2)' }}>
            手动补充要点（可选，逐行一条，用于腾讯文档等抓不到正文的场景兜底）
            <textarea value={draft.manualKeypoints} onChange={(e) => update({ manualKeypoints: e.target.value })} rows={3} className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-[13px] outline-none" style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-t1)', backgroundColor: 'var(--sop-panel)' }} />
          </label>
        )}

        {notice && (
          <p className="mt-3 text-[13px]" style={{ color: 'var(--sop-warning, var(--sop-t2))' }}>
            {notice}
          </p>
        )}
        {error && (
          <p className="mt-3 text-[13px]" style={{ color: 'var(--sop-danger)' }}>
            {error}
          </p>
        )}

        {/* 底部：取消 ｜ 保存 ｜ 确认上传 */}
        <div className="mt-5 flex items-center justify-end gap-2">
          {mode === 'file' && files.length > 0 && !anyNeedsReselect && (
            <span className="mr-auto text-xs" style={{ color: 'var(--sop-t3)' }}>
              已完成 {doneCount}/{files.length}
            </span>
          )}
          <button type="button" onClick={requestClose} className="rounded-md px-4 py-1.5 text-sm" style={{ backgroundColor: 'var(--sop-muted)', color: 'var(--sop-t2)' }}>
            取消
          </button>
          <button type="button" onClick={() => onSave(draftRef.current)} className="inline-flex items-center gap-1.5 rounded-md border px-4 py-1.5 text-sm" style={{ borderColor: 'var(--sop-border)', color: 'var(--sop-t2)' }}>
            <Save size={14} /> 保存
          </button>
          <button
            type="button"
            disabled={!canSubmit && !submitting}
            onClick={submit}
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: 'var(--sop-primary)' }}
          >
            {submitting && <RefreshCw size={14} className="animate-spin" />}
            {submitting ? '上传中…' : '确认上传'}
          </button>
        </div>
      </div>

      {/* 二次确认关闭（有内容时） */}
      {confirmClose && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.30)' }} onClick={(e) => e.stopPropagation()}>
          <div className="w-[420px] rounded-lg p-6" style={{ backgroundColor: 'var(--sop-panel)', border: '1px solid var(--sop-border)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-bold" style={{ color: 'var(--sop-t1)' }}>
              还有未上传的内容
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--sop-t2)' }}>
              确定关闭吗？可先点「保存」保留进度，下次打开继续上传。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmClose(false)} className="rounded-md px-4 py-1.5 text-sm" style={{ backgroundColor: 'var(--sop-muted)', color: 'var(--sop-t2)' }}>
                继续编辑
              </button>
              <button type="button" onClick={closeFinalize} className="rounded-md px-4 py-1.5 text-sm font-medium text-white" style={{ backgroundColor: 'var(--sop-danger)' }}>
                仍要关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 图片放大预览 */}
      {showPreview && showPreview.file && (
        <div className="fixed inset-0 z-[70] flex cursor-zoom-out flex-col items-center justify-center gap-3 p-8" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }} onClick={() => setShowPreview(null)}>
          <FileThumb it={showPreview} onPreview={() => {}} className="max-h-[84vh] max-w-[90vw] rounded-lg object-contain" />
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>{showPreview.name}</p>
        </div>
      )}
    </div>
  );
}