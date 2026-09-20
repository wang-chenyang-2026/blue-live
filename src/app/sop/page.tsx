'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/contexts/AppContext';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BookOpen, FileText, HelpCircle, Search, Filter } from 'lucide-react';

type Doc = {
  id: string;
  doc_type: 'management' | 'training';
  title: string;
  category: string | null;
  applicable_brand: string[] | null;
  applicable_post: string[] | null;
  source_type: 'link' | 'file';
  external_url: string | null;
  visibility: 'internal' | 'general';
  needs_quiz: boolean;
  status: string;
  version: number;
};

type CategoryRow = { id: number; type: string; label: string; sort_order: number };

const DOC_TYPE_META: Record<string, { label: string; badgeVariant: 'default' | 'secondary' }> = {
  management: { label: '制度', badgeVariant: 'default' },
  training: { label: '培训', badgeVariant: 'secondary' },
};

const TAB_LABEL: Record<string, string> = {
  all: '全部',
  management: '制度文档',
  training: '培训文档',
};

export default function SopListPage() {
  const { isClient, currentRole } = useApp();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tab, setTab] = useState('all');
  const [category, setCategory] = useState('all');
  const [brand, setBrand] = useState('all');
  const [keyword, setKeyword] = useState('');

  const isExternal = currentRole === '外部合作';

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/sop/categories', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.success) setCategories(data.categories || []);
    } catch (err) {
      console.error('load sop categories error', err);
    }
  }, []);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (tab !== 'all') params.set('doc_type', tab);
      if (category !== 'all') params.set('category', category);
      if (brand !== 'all') params.set('brand', brand);
      if (keyword.trim()) params.set('q', keyword.trim());

      const res = await fetch(`/api/sop/documents?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.success) {
        setDocs(data.docs || []);
      } else {
        setError(data?.error || '加载失败');
      }
    } catch (err) {
      console.error('load sop docs error', err);
      setError('网络异常，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [tab, category, brand, keyword]);

  useEffect(() => {
    if (!isClient) return;
    loadCategories();
  }, [isClient, loadCategories]);

  useEffect(() => {
    if (!isClient) return;
    const timer = setTimeout(loadDocs, 120);
    return () => clearTimeout(timer);
  }, [isClient, loadDocs]);

  const categoryOptions = useMemo(
    () =>
      categories
        .filter((c) => c.type === 'category')
        .map((c) => ({ value: c.label, label: c.label })),
    [categories]
  );
  const brandOptions = useMemo(
    () => categories.filter((c) => c.type === 'brand').map((c) => c.label),
    [categories]
  );

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
          {isExternal
            ? '当前账号为外部合作角色，仅可查看通用公开资料'
            : '请调整筛选条件或关键词后再试'}
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">SOP管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            制度与培训标准操作流程文档库
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">{TAB_LABEL.all}</TabsTrigger>
          <TabsTrigger value="management">{TAB_LABEL.management}</TabsTrigger>
          <TabsTrigger value="training">{TAB_LABEL.training}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索文档标题…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[160px]" aria-label="内容分类">
              <SelectValue placeholder="内容分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分类</SelectItem>
              {categoryOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger className="w-[160px]" aria-label="适用品牌">
              <SelectValue placeholder="适用品牌" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部品牌</SelectItem>
              {brandOptions.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

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
            const meta = DOC_TYPE_META[doc.doc_type] || { label: doc.doc_type, badgeVariant: 'secondary' };
            const hasUrl = !!doc.external_url;
            return (
              <Card key={doc.id} className="flex flex-col border-border bg-card">
                <CardContent className="flex flex-1 flex-col p-5">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
                    {doc.category && (
                      <Badge variant="outline">{doc.category}</Badge>
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
                  <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {doc.applicable_brand?.length
                      ? doc.applicable_brand.map((b) => (
                          <span
                            key={b}
                            className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
                          >
                            {b}
                          </span>
                        ))
                      : null}
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs">
                      {hasUrl ? (
                        <span className="flex items-center gap-1 text-emerald-500">
                          <FileText className="h-3.5 w-3.5" /> 已挂在线文档
                        </span>
                      ) : (
                        <span className="text-muted-foreground">资料待补充</span>
                      )}
                    </div>
                    <Button asChild size="sm" variant={hasUrl ? 'default' : 'outline'}>
                      <Link href={`/sop/doc/${doc.id}`}>
                        {hasUrl ? '查看文档' : '查看详情'}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}