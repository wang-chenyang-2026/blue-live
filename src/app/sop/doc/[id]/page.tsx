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
} from 'lucide-react';

type SopDoc = {
  id: string;
  doc_type: 'management' | 'training';
  title: string;
  category: string | null;
  applicable_post: string[] | null;
  applicable_brand: string[] | null;
  source_type: 'link' | 'file';
  external_url: string | null;
  visibility: 'internal' | 'general';
  needs_quiz: boolean;
  status: string;
  version: number;
  created_by: string | null;
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
    (async () => {
      try {
        const res = await fetch(`/api/sop/documents/${id}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) {
          if (data?.status === 404 || res.status === 404) setNotFound(true);
          else setError(data?.error || '加载失败');
          return;
        }
        if (data.success && data.doc) setDoc(data.doc);
        else setError(data?.error || '加载失败');
      } catch (err) {
        console.error('load sop doc error', err);
        setError('网络异常，请稍后重试');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
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
            <p className="mt-1 text-sm text-muted-foreground">SOP 管理 · 资料查阅</p>
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
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
              {doc.category && <Badge variant="outline">{doc.category}</Badge>}
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
                    <p className="font-medium text-foreground">已在线上架</p>
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
                    打开在线文档 <ExternalLink className="h-3.5 w-3.5" />
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
              <Field label="内容分类" value={doc.category ?? '—'} />
              <Field
                label="适用岗位"
                value={doc.applicable_post?.length ? doc.applicable_post.join('、') : '—'}
              />
              <Field
                label="适用品牌"
                value={doc.applicable_brand?.length ? doc.applicable_brand.join('、') : '—'}
              />
              <Field label="来源类型" value={doc.source_type === 'file' ? '上传文件' : '在线链接'} />
              <Field label="可见范围" value={VISIBILITY_LABEL[doc.visibility] ?? doc.visibility} />
              <Field label="发布状态" value={STATUS_LABEL[doc.status] ?? doc.status} />
              <Field label="版本号" value={`v${doc.version}`} />
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

