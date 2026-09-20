'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BookOpen,
  FileText,
  HelpCircle,
  Search,
  Upload,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileUp,
} from 'lucide-react';
import {
  SCOPE_OPTIONS,
  SUB_CATEGORY_OPTIONS,
  SOURCE_TYPE_OPTIONS,
  scopeLabel,
  subCategoryLabel,
} from '@/lib/sop-taxonomy';

type Doc = {
  id: string;
  doc_type: 'management' | 'training';
  title: string;
  category: string | null;
  sub_category: string | null;
  scope: string | null;
  applicable_brand: string[] | null;
  source_type: string | null;
  external_url: string | null;
  needs_quiz: boolean;
  ai_status: string | null;
  ai_summary: string | null;
  ai_keypoints: string[] | null;
  updated_at: string;
  read: boolean;
};

const AI_STATUS_META: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  pending: { label: '待提炼', icon: <Sparkles className="h-3 w-3" />, cls: 'text-muted-foreground' },
  processing: { label: '提炼中', icon: <Loader2 className="h-3 w-3 animate-spin" />, cls: 'text-amber-500' },
  done: { label: '已提炼', icon: <CheckCircle2 className="h-3 w-3" />, cls: 'text-emerald-500' },
  failed: { label: 'AI不可用', icon: <AlertCircle className="h-3 w-3" />, cls: 'text-muted-foreground' },
};

export default function SopListPage() {
  const { isClient, currentRole } = useApp();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [scopes, setScopes] = useState<string[]>(['general']);
  const [canUpload, setCanUpload] = useState(currentRole === 'PM' || currentRole === '运营');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [scope, setScope] = useState('all');
  const [subCat, setSubCat] = useState('all');
  const [keyword, setKeyword] = useState('');

  // 上传弹窗
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    external_url: '',
    doc_type: 'training',
    scope: '',
    sub_category: '',
    remark: '',
    manual_keypoints: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState('');

  const isExternal = currentRole === '外部合作';

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (scope !== 'all') params.set('scope', scope);
      if (subCat !== 'all') params.set('sub_category', subCat);
      if (keyword.trim()) params.set('keyword', keyword.trim());
      const res = await fetch(`/api/sop/documents?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.success) {
        setDocs(data.docs || []);
        setScopes(data.scopes?.length ? data.scopes : ['general']);
        setCanUpload(!!data.canUpload);
      } else {
        setError(data?.error || '加载失败');
      }
    } catch (err) {
      console.error(err);
      setError('网络异常，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [scope, subCat, keyword]);

  useEffect(() => {
    if (!isClient) return;
    const timer = setTimeout(loadDocs, 120);
    return () => clearTimeout(timer);
  }, [isClient, loadDocs]);

  // 上传成功后让「提炼中」状态可轮询刷新
  useEffect(() => {
    if (!isClient || !dialogOpen || docs.length === 0) return;
    const hasProcessing = docs.some((d) => d.ai_status === 'processing' || d.ai_status === 'pending');
    if (!hasProcessing) return;
    const t = setInterval(loadDocs, 5000);
    return () => clearInterval(t);
  }, [isClient, dialogOpen, docs, loadDocs]);

  if (!isClient) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      </div>
    );
  }

  const renderEmpty = () => (
    <Card className="border-border bg-card">
      <CardContent className="py-16 text-center">
        <BookOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-2 text-lg font-medium text-foreground">
          {isExternal ? '暂无可查看内容' : '暂无匹配文档'}
        </h3>
        <p className="text-sm text-muted-foreground">
          {isExternal ? '当前账号为外部合作角色，仅可查看通用公开资料' : '请调整筛选条件或关键词后再试'}
        </p>
      </CardContent>
    </Card>
  );

  const submitUpload = async () => {
    setFormError('');
    const payload = {
      title: form.title.trim(),
      external_url: form.external_url.trim(),
      doc_type: form.doc_type,
      scope: form.scope,
      sub_category: form.sub_category,
      remark: form.remark.trim(),
      manual_keypoints: form.manual_keypoints
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    };
    if (!payload.title) return setFormError('请填写标题');
    if (!payload.external_url) return setFormError('请填写飞书或腾讯文档链接');
    if (!payload.scope) return setFormError('请选择一级业务域');
    if (!payload.sub_category) return setFormError('请选择二级类目');

    setSubmitting(true);
    try {
      const res = await fetch('/api/sop/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return setFormError(data?.error || '上传失败');
      setDialogOpen(false);
      setForm({ title: '', external_url: '', doc_type: 'training', scope: '', sub_category: '', remark: '', manual_keypoints: '' });
      setToast('上传成功，正在触发 AI 提炼…');
      setTimeout(() => setToast(''), 4000);
      loadDocs();
    } catch (err) {
      console.error(err);
      setFormError('网络异常，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">SOP管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">制度与培训标准操作流程 · 知识分发</p>
          </div>
        </div>
        {canUpload && (
          <Button onClick={() => setDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> 上传内容
          </Button>
        )}
      </div>

      {/* 一级业务域页签 */}
      <Tabs value={scope} onValueChange={(v) => setScope(v)} scopes={scopes} />

      {/* 二级类目 chips */}
      <div className="flex flex-wrap items-center gap-2">
        {[{ value: 'all', label: '全部分类' }, ...SUB_CATEGORY_OPTIONS.map((s) => ({ value: s.value, label: s.label }))].map((c) => (
          <button
            key={c.value}
            onClick={() => setSubCat(subCat === c.value ? 'all' : c.value)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              subCat === c.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* 搜索 */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索文档标题…"
          className="pl-9"
        />
      </div>

      {toast && <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">{toast}</p>}
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        renderEmpty()
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {docs.map((doc) => {
            const hasUrl = !!doc.external_url;
            const aiMeta = AI_STATUS_META[doc.ai_status || 'pending'] || AI_STATUS_META.pending;
            const source = SOURCE_TYPE_OPTIONS.find((s) => s.value === doc.source_type);
            return (
              <Card key={doc.id} className="relative flex flex-col border-border bg-card">
                {!doc.read && (
                  <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-primary" title="未读" />
                )}
                <CardContent className="flex flex-1 flex-col p-5">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="outline">{scopeLabel(doc.scope || '')}</Badge>
                    {doc.sub_category && (
                      <Badge variant={doc.sub_category === 'product' ? 'default' : 'secondary'}>
                        {subCategoryLabel(doc.sub_category)}
                      </Badge>
                    )}
                    {doc.needs_quiz && (
                      <Badge variant="destructive" className="gap-1">
                        <HelpCircle className="h-3 w-3" /> 需考核
                      </Badge>
                    )}
                  </div>
                  <h3 className="mb-2 line-clamp-2 flex-1 text-base font-semibold leading-snug text-foreground">
                    {doc.title}
                  </h3>
                  <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {source && (
                      <span className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" /> {source.label}
                      </span>
                    )}
                    <span className={`flex items-center gap-1 ${aiMeta.cls}`}>{aiMeta.icon}{aiMeta.label}</span>
                    <span>{new Date(doc.updated_at).toLocaleDateString('zh-CN')}</span>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <span className="text-xs">
                      {hasUrl ? (
                        <span className="flex items-center gap-1 text-emerald-500">
                          <FileUp className="h-3.5 w-3.5" /> 已挂在线文档
                        </span>
                      ) : (
                        <span className="text-muted-foreground">资料待补充</span>
                      )}
                    </span>
                    <Button asChild size="sm" variant={hasUrl ? 'default' : 'outline'}>
                      <Link href={`/sop/doc/${doc.id}`}>{hasUrl ? '查看文档' : '查看详情'}</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 上传弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>上传 SOP 内容</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>标题 *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="文档标题" />
            </div>
            <div className="space-y-2">
              <Label>文档链接 *（飞书 feishu.cn / larksuite.com 或腾讯文档 docs.qq.com）</Label>
              <Input value={form.external_url} onChange={(e) => setForm({ ...form, external_url: e.target.value })} placeholder="https://…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>一级业务域 *</Label>
                <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v })}>
                  <SelectTrigger aria-label="一级业务域"><SelectValue placeholder="选择业务域" /></SelectTrigger>
                  <SelectContent>
                    {SCOPE_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>二级类目 *</Label>
                <Select value={form.sub_category} onValueChange={(v) => setForm({ ...form, sub_category: v })}>
                  <SelectTrigger aria-label="二级类目"><SelectValue placeholder="选择类目" /></SelectTrigger>
                  <SelectContent>
                    {SUB_CATEGORY_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>手动补充要点（可选，给腾讯文档等无法抓正文的来源兜底，每行一条）</Label>
              <Textarea value={form.manual_keypoints} onChange={(e) => setForm({ ...form, manual_keypoints: e.target.value })} rows={3} placeholder={'要点一\n要点二'} />
            </div>
            <div className="space-y-2">
              <Label>备注（可选）</Label>
              <Input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} placeholder="备注说明" />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>取消</Button>
            <Button onClick={submitUpload} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Tabs({
  value,
  onValueChange,
  scopes,
}: {
  value: string;
  onValueChange: (v: string) => void;
  scopes: string[];
}) {
  const scopeTabs = SCOPE_OPTIONS.filter((s) => scopes.includes(s.value));
  return (
    <div className="inline-flex rounded-lg bg-muted p-1">
      <button
        onClick={() => onValueChange('all')}
        className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
          value === 'all' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        全部
      </button>
      {scopeTabs.map((s) => (
        <button
          key={s.value}
          onClick={() => onValueChange(s.value)}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            value === s.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}