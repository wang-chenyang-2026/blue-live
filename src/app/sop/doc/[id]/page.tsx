'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import SopDocDetailBody, { SopDetailDoc } from '@/components/sop/SopDocDetailBody';
import '@/components/sop/sop-theme.css';

export default function SopDocDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<SopDetailDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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

  return (
    <div className="sop-scope flex min-h-screen items-start justify-center" style={{ backgroundColor: 'var(--sop-bg)' }}>
      <div className="mt-6 w-full max-w-4xl px-4 pb-12">
        <Link
          href="/sop"
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium"
          style={{ color: 'var(--sop-primary)' }}
        >
          <ArrowLeft size={14} /> 返回 SOP 文档库
        </Link>
        <div className="rounded-lg p-6" style={{ backgroundColor: 'var(--sop-panel)', border: '1px solid var(--sop-border)' }}>
          {loading ? (
            <p style={{ color: 'var(--sop-t3)' }}>加载中…</p>
          ) : notFound || !doc ? (
            <p style={{ color: 'var(--sop-t3)' }}>文档不存在或您无权访问。</p>
          ) : (
            <SopDocDetailBody doc={doc} canUpload={false} />
          )}
        </div>
      </div>
    </div>
  );
}