'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  FileQuestion,
  FileText,
  HelpCircle,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { scopeLabel, subCategoryLabel } from '@/lib/sop-taxonomy';

type SopDoc = {
  id: string;
  doc_type: 'management' | 'training';
  title: string;
  category: string | null;
  sub_category: string | null;
  scope: string | null;
  applicable_post: string[] | null;
  applicable_brand: string[] | null;
  source_type: string | null;
  external_url: string | null;
  visibility: 'internal' | 'general';
  needs_quiz: boolean;
  status: string;
  version: number;
  ai_status: string | null;
  ai_summary: string | null;
  ai_keypoints: string[] | null;
  ai_error: string | null;
  uploader_name: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const DOC_TYPE_META: Record<string, { label: string; badgeVariant: 'default' | 'secondary' }> = {
  management: { label: '制度', badgeVariant: 'default' },
  training: { label: '培训', badgeVariant: 'secondary' },
};

const VISIBILITY_LABEL: Record<string, string> = {
  internal: '内部可见',
  general: '通用公开',
};

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
};

const SOURCE_LABEL: Record<string, string> = {
  feishu: '飞书文档',
  tencent: '腾讯文档',
  manual: '手动维护',
};

export default function SopDocDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { isClient } = useApp();

  const [doc, setDoc] = useState<SopDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isClient || !id) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/sop/documents/${id}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 404) setNotFound(true);
          else setError(data?.error || '加载失败');
          return;
        }
        if (data.success && data.doc) {
          setDoc(data.doc);
          // 打开即记为已读（幂等，unique(doc_id, user_id)）
          fetch(`/api/sop/documents/${id}/read`, { method: 'POST' }).catch(() => {});
        } else {
          setError(data?.error || '加载失败');
        }
      } catch (err) {
        console.error('load sop doc error', err);
        setError('网络异常，请稍后重试');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    // 提炼中轮询刷新
    const timer = setInterval(load, 6000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isClient, id]);

  if (!isClient) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl border border-border bg-card" />
      </div>
    );
  }

  const meta = doc ? DOC_TYPE_META[doc.doc_type] || { label: doc.doc_type, badgeVariant: 'secondary' } : null;
  const hasUrl = !!doc?.external_url;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
          <Link href="/sop">
            <ArrowLeft className="mr-1 h-4 w-4" /> 返回文档库
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">文档详情</h1>
            <p className="mt-1 text-sm text-muted-foreground">SOP 管理 · AI 先提炼，再看原文</p>
          </div>
        </div>
      </div>

      {loading ? (
        <Card className="border-border bg-card">
          <CardContent className="py-16 text-center">
            <BookOpen className="mx-auto mb-4 h-10 w-10 animate-pulse text-muted-foreground" />
          </CardContent>
        </Card>
      ) : notFound || (!doc && !error) ? (
        <Card className="border-border bg-card">
          <CardContent className="py-16 text-center">
            <FileQuestion className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-medium text-foreground">文档不存在或无权访问</h3>
            <p className="mb-4 text-sm text-muted-foreground">该文档可能已下架，或当前角色无权查看</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/sop">返回文档库</Link>
            </Button>
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-border bg-card">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : doc && meta ? (
        <>
          {/* AI 提炼卡片 */}
          <Card className="border-border bg-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">AI 提炼</CardTitle>
                {doc.ai_status === 'processing' || doc.ai_status === 'pending' ? (
                  <Badge variant="outline" className="gap-1 text-amber-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> 提炼中…
                  </Badge>
                ) : doc.ai_status === 'done' ? (
                  <Badge variant="outline" className="gap-1 text-emerald-500">
                    <CheckCircle2 className="h-3 w-3" /> 已提炼
                  </Badge>
                ) : doc.ai_status === 'failed' ? (
                  <Badge variant="outline" className="gap-1 text-muted-foreground">
                    <AlertCircle className="h-3 w-3" /> AI 提炼不可用
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {doc.ai_status === 'done' ? (
                <>
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">概述</p>
                    <p className="text-sm leading-relaxed text-foreground">{doc.ai_summary || '—'}</p>
                  </div>
                  {doc.ai_keypoints?.length ? (
                    <div>
                      <p className="mb-2 text-xs text-muted-foreground">关键要点</p>
                      <ul className="space-y-1.5">
                        {doc.ai_keypoints.map((k, i) => (
                          <li key={i} className="flex gap-2 text-sm text-foreground">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            {k}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : doc.ai_status === 'processing' || doc.ai_status === 'pending' ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> 正在提炼关键内容，请稍候自动刷新…
                </p>
              ) : doc.ai_status === 'failed' ? (
                <div className="rounded-lg border border-dashed border-muted p-4 text-sm text-muted-foreground">
                  <p className="mb-1 flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" /> AI 提炼暂不可用，可直接查看原文
                  </p>
                  {doc.ai_error && <p className="text-xs">{doc.ai_error}</p>}
                  {doc.ai_keypoints?.length ? (
                    <div className="mt-3">
                      <p className="mb-2 text-xs text-muted-foreground">上传人手动补充要点</p>
                      <ul className="space-y-1.5">
                        {doc.ai_keypoints.map((k, i) => (
                          <li key={i} className="flex gap-2 text-foreground">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            {k}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* 正文卡片 */}
          <Card className="border-border bg-card">
            <CardHeader>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
                <Badge variant="outline">{scopeLabel(doc.scope || '')}</Badge>
                {doc.sub_category && <Badge variant="secondary">{subCategoryLabel(doc.sub_category)}</Badge>}
                {doc.needs_quiz && (
                  <Badge variant="destructive" className="gap-1">
                    <HelpCircle className="h-3 w-3" /> 需考核
                  </Badge>
                )}
              </div>
              <CardTitle className="text-xl leading-snug text-foreground">{doc.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* 来源状态 */}
              {hasUrl ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="flex items-center gap-3">
                    <ExternalLink className="h-5 w-5 text-emerald-500" />
                    <div>
                      <p className="font-medium text-foreground">查看正式原文</p>
                      <p className="truncate text-xs text-muted-foreground">{doc.external_url}</p>
                    </div>
                  </div>
                  <Button asChild size="sm">
                    <a
                      href={doc.external_url ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="gap-1.5"
                    >
                      打开原文 <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-dashed border-muted p-4">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">资料待补充</p>
                    <p className="text-xs text-muted-foreground">
                      该文档暂未挂接在线链接，请等待资料补充后查阅
                    </p>
                  </div>
                </div>
              )}

              {/* 字段明细 */}
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <Field label="来源" value={SOURCE_LABEL[doc.source_type || ''] ?? (doc.source_type === 'file' ? '上传文件' : '—')} />
                <Field
                  label="适用岗位"
                  value={doc.applicable_post?.length ? doc.applicable_post.join('、') : '—'}
                />
                <Field
                  label="适用品牌"
                  value={doc.applicable_brand?.length ? doc.applicable_brand.join('、') : '—'}
                />
                <Field label="可见范围" value={VISIBILITY_LABEL[doc.visibility] ?? doc.visibility} />
                <Field label="发布状态" value={STATUS_LABEL[doc.status] ?? doc.status} />
                {doc.uploader_name ? <Field label="上传人" value={doc.uploader_name} /> : null}
                <Field
                  label="需考核"
                  value={
                    doc.needs_quiz ? (
                      <span className="flex items-center gap-1 text-destructive">
                        <HelpCircle className="h-3.5 w-3.5" /> 是
                      </span>
                    ) : (
                      <span className="text-muted-foreground">否</span>
                    )
                  }
                />
              </div>
              <div className="border-t border-border pt-3 text-xs text-muted-foreground">
                {doc.created_at ? `创建时间：${formatTime(doc.created_at)}` : ' '}
                {doc.updated_at ? ` · 更新时间：${formatTime(doc.updated_at)}` : ''}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="mb-0.5 text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}