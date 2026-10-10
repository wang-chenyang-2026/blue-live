'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import TaskConfigPanel from '@/components/buyin/TaskConfigPanel';
import ResultsPanel from '@/components/buyin/ResultsPanel';

interface StartRes {
  ok: boolean;
  sessionId?: string;
  image?: string;
  status?: string;
  failedStep?: string;
  error?: string;
  debug?: { shotMode?: string };
}

interface StatusRes {
  ok?: boolean;
  status: string;
  accountHint?: string | null;
  cookieCount?: number;
  sessionId?: string;
  error?: string;
}

type Phase = 'idle' | 'starting' | 'waiting' | 'logged_in' | 'expired' | 'not_found' | 'error';

const POLL_INTERVAL = 2500;

export default function BuyinSpikePage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [accountHint, setAccountHint] = useState<string | null>(null);
  const [cookieCount, setCookieCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [pollKey, setPollKey] = useState(0);
  const currentRef = useRef<string | null>(null);

  const start = useCallback(async () => {
    const prev = currentRef.current;
    if (prev) {
      fetch('/api/buyin-spike/session/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: prev }),
      }).catch(() => undefined);
    }
    currentRef.current = null;
    setQrImage(null);
    setAccountHint(null);
    setCookieCount(null);
    setError(null);
    setPollCount(0);
    setPhase('starting');
    try {
      const d = (await (await fetch('/api/buyin-spike/session/start', { method: 'POST' })).json()) as StartRes;
      if (d.ok && d.sessionId && d.image) {
        currentRef.current = d.sessionId;
        setQrImage(d.image);
        setPhase('waiting');
        setPollKey((k) => k + 1);
      } else {
        setPhase('error');
        setError(d.error || d.failedStep || 'start 未返回二维码');
      }
    } catch (e) {
      setPhase('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const tick = useCallback(async () => {
    const id = currentRef.current;
    if (!id) return;
    try {
      const d = (await (await fetch(`/api/buyin-spike/session/status?sessionId=${encodeURIComponent(id)}`)).json()) as StatusRes;
      setPollCount((c) => c + 1);
      if (d.status === 'logged_in') {
        setAccountHint(d.accountHint ?? null);
        setCookieCount(d.cookieCount ?? 0);
        setPhase('logged_in');
      } else if (d.status === 'expired' || d.status === 'not_found') {
        setPhase(d.status);
      } else if (d.status === 'error') {
        setError(d.error || 'status 接口异常');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (phase !== 'waiting') return;
    void tick();
    const t = setInterval(tick, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [phase, pollKey, tick]);

  useEffect(
    () => () => {
      const id = currentRef.current;
      if (id) {
        fetch('/api/buyin-spike/session/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: id }),
        }).catch(() => undefined);
      }
    },
    [],
  );

  const buttonLabel =
    phase === 'starting'
      ? '启动会话…'
      : phase === 'waiting'
        ? '重新获取'
        : phase === 'logged_in'
          ? '重新登录'
          : '连接百应 / 获取二维码';

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-1 text-xl font-semibold">百应登录 · 常驻会话闭环</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        后端维持一个常驻无头浏览器。扫码后自动轮询，检测到进入百应主页即保存 cookie（后端持有，不回显明文）。
      </p>

      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={start}
          disabled={phase === 'starting'}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition disabled:opacity-60"
        >
          {buttonLabel}
        </button>
      </div>

      {phase === 'starting' && (
        <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          正在启动常驻浏览器并取回二维码，请稍候…
        </div>
      )}

      {(phase === 'waiting' || phase === 'logged_in') && qrImage && (
        <div className="mb-5 flex w-fit flex-col items-center rounded-lg border border-border bg-card p-5">
          <img src={qrImage} alt="抖音登录二维码" className="h-56 w-56 object-contain" />
          <p className="mt-2 text-xs text-muted-foreground">用抖音 App 扫一扫登录百应</p>
          <div className="mt-2 flex items-center gap-2 text-xs">
            {phase === 'waiting' ? (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                <span className="text-muted-foreground">等待扫码…（已轮询 {pollCount} 次）</span>
              </>
            ) : (
              <span className="font-medium text-[#34C759]">登录成功</span>
            )}
          </div>
        </div>
      )}

      {phase === 'logged_in' && (
        <div className="mb-5 rounded-lg border border-[#34C759]/40 bg-[#34C759]/10 p-4 text-sm">
          <p className="mb-1 font-medium text-[#34C759]">登录成功！cookie 已保存到后端会话</p>
          <p className="text-muted-foreground">
            识别账号：{accountHint ?? '未知（未识别到 uid/name cookie）'} · cookie 数量：{cookieCount ?? 0}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            浏览器会话保留供后续采集；下方「重新登录」将先关闭当前会话。
          </p>
        </div>
      )}

      {(phase === 'expired' || phase === 'not_found') && (
        <div className="mb-5 rounded-lg border border-[#FF9F0A]/40 bg-[#FF9F0A]/10 p-4 text-sm">
          <p className="mb-1 font-medium text-[#FF9F0A]">
            会话已{phase === 'expired' ? '过期（5 分钟未完成）' : '不存在或已清理'}
          </p>
          <p className="text-muted-foreground">请点击上方按钮重新获取二维码。</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <p className="mb-1 font-medium text-destructive">会话启动失败</p>
          {error && <p className="break-all text-muted-foreground">错误：{error}</p>}
        </div>
      )}

      <div className="mt-8 border-t border-border pt-6">
        <h2 className="mb-1 text-base font-semibold">② 采集任务配置</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {phase === 'logged_in' ? '已登录，可配置采集任务并保存到数据库。' : '登录百应成功后可用；未登录时仅浏览。'}
        </p>
        <TaskConfigPanel loggedIn={phase === 'logged_in'} accountHint={phase === 'logged_in' ? accountHint : null} />
      </div>

      <ResultsPanel />
    </div>
  );
}