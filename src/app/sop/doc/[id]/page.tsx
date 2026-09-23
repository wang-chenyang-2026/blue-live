'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import SopDocDetailBody, { SopDetailDoc } from '@/components/sop/SopDocDetailBody';
import '@/components/sop/sop-theme.css';

function SopDocDetailInner() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const scope = searchParams.get('scope');
  const category = searchParams.get('category');
  const [doc, setDoc] = useState<SopDetailDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const backQuery = [
    scope ? `scope=${encodeURIComponent(scope)}` : '',
    category ? `category=${encodeURIComponent(category)}` : '',
  ]
    .filter(Boolean)
    .join('&');
  const backHref = backQuery ? `/sop?${backQuery}` : '/sop';

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sop/documents/${id}`, { headers: { 'Content-Type': 'application/json' } });
      if (res.status === 404) {
        setNotFound(true);
        setDoc(null);
        return;
      }
      const json = await res.json();
      if (json?.success && json.doc) {
        setDoc(json.doc as SopDetailDoc);
        setNotFound(false);
      } else {
        setNotFound(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 静默刷新详情：用于 PDF 签名 URL 失效后的「重新加载」→ 重新拉详情获取新签名 URL，不整页闪加载
  const refreshDoc = async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/sop/documents/${id}`, { headers: { 'Content-Type': 'application/json' } });
      if (res.status === 404) {
        setNotFound(true);
        setDoc(null);
        return;
      }
      const json = await res.json();
      if (json?.success && json.doc) {
        setDoc(json.doc as SopDetailDoc);
        setNotFound(false);
      }
    } catch {
      /* 静默：保持现状，等待用户再次操作 */
    }
  };

  // 一键授权平台读取该飞书文档（单篇，提交人/管理员）
  const grantFeishu = async () => {
    if (!id) return null;
    try {
      const res = await fetch('/api/sop/feishu/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: id }),
      });
      const json = await res.json();
      if (res.ok) {
        void refreshDoc();
        return { granted: true, readable: !!json.readable, message: json.message };
      }
      return { granted: false, readable: false, message: json.message ?? '授权失败' };
    } catch {
      return null;
    }
  };

  // 重新检查：bot 优先重新抓取正文
  const recheckFeishu = async () => {
    if (!id) return null;
    try {
      const res = await fetch('/api/sop/feishu/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: id }),
      });
      const json = await res.json();
      if (res.ok) {
        void refreshDoc();
        return { readable: !!json.readable, message: json.message };
      }
      return null;
    } catch {
      return null;
    }
  };

  return (
    <div className="sop-scope flex min-h-screen items-start justify-center" style={{ backgroundColor: 'var(--sop-bg)' }}>
      <div className="mt-6 w-full max-w-[1000px] px-6 pb-14">
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
          style={{ backgroundColor: 'var(--sop-panel)', borderColor: 'var(--sop-primary)', color: 'var(--sop-primary)' }}
        >
          <ArrowLeft size={14} /> 返回文档列表
        </Link>
        <div className="rounded-[14px] p-[30px]" style={{ backgroundColor: 'var(--sop-panel)', border: '1px solid var(--sop-border)' }}>
          {loading ? (
            <p style={{ color: 'var(--sop-t3)' }}>加载中…</p>
          ) : notFound || !doc ? (
            <p style={{ color: 'var(--sop-t3)' }}>文档不存在或您无权访问。</p>
          ) : (
            <SopDocDetailBody
              doc={doc}
              canUpload={false}
              onRefreshDoc={refreshDoc}
              onGrantFeishu={grantFeishu}
              onRecheckFeishu={recheckFeishu}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function SopDocDetailPage() {
  return (
    <Suspense fallback={null}>
      <SopDocDetailInner />
    </Suspense>
  );
}