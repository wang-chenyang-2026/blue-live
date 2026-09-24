'use client';

import { useState } from 'react';

interface SpikeDebug {
  browserLaunched: boolean;
  pageLoaded: boolean;
  pageStatus: number | null;
  pageUrl: string | null;
  qrFound: boolean;
  timingMs: { launch: number; goto: number; qr: number; screenshot: number };
  engine: string;
  shotMode: string;
  shotBytes: number;
}

interface SpikeRes {
  ok: boolean;
  failedStep: string | null;
  error: string | null;
  image: string | null;
  debug: SpikeDebug;
}

export default function BuyinSpikePage() {
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<SpikeRes | null>(null);

  const fetchQr = async () => {
    setLoading(true);
    setRes(null);
    try {
      const r = await fetch('/api/buyin-spike/qr', { method: 'POST' });
      const data = (await r.json()) as SpikeRes;
      setRes(data);
    } catch (e) {
      setRes({
        ok: false,
        failedStep: 'network',
        error: e instanceof Error ? e.message : String(e),
        image: null,
        debug: {
          browserLaunched: false,
          pageLoaded: false,
          pageStatus: null,
          pageUrl: null,
          qrFound: false,
          timingMs: { launch: 0, goto: 0, qr: 0, screenshot: 0 },
          engine: 'fetch-error',
          shotMode: 'none',
          shotBytes: 0,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-1 text-xl font-semibold">百应登录 · 技术验证 Spike</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        验证后端能否拉起无头 Chromium，打开巨量百应登录页并取回抖音扫码二维码（本页为独立验证页，非正式入口）。
      </p>

      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={fetchQr}
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition disabled:opacity-60"
        >
          {loading ? '获取中…' : res?.image ? '重新获取' : '连接百应 / 获取二维码'}
        </button>
        {(loading || res) && (
          <span className="text-xs text-muted-foreground">
            {loading
              ? '正在启动浏览器并等待二维码渲染（约需 5-25s）…'
              : res
                ? `上次执行：${res.ok ? '成功' : '失败'} · ${res.debug.timingMs.launch + res.debug.timingMs.goto + res.debug.timingMs.qr + res.debug.timingMs.screenshot}ms`
                : ''}
          </span>
        )}
      </div>

      {loading && (
        <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          正在取回二维码，请稍候…
        </div>
      )}

      {!loading && res?.ok && res.image && (
        <div className="mb-5 flex w-fit flex-col items-center rounded-lg border border-border bg-card p-5">
          <img src={res.image} alt="抖音登录二维码" className="h-56 w-56 object-contain" />
          <p className="mt-2 text-xs text-muted-foreground">用抖音 App 扫一扫登录百应</p>
        </div>
      )}

      {!loading && res && !res.ok && (
        <div className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <p className="mb-1 font-medium text-destructive">获取失败</p>
          {res.failedStep && <p className="text-muted-foreground">失败步骤：{res.failedStep}</p>}
          {res.error && <p className="break-all text-muted-foreground">错误：{res.error}</p>}
        </div>
      )}

      {!loading && res && (
        <details className="rounded-lg border border-border bg-card p-4" open>
          <summary className="cursor-pointer text-sm font-medium">后端调试信息（结构化）</summary>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
            {JSON.stringify(
              {
                ok: res.ok,
                failedStep: res.failedStep,
                error: res.error,
                debug: res.debug,
              },
              null,
              2,
            )}
          </pre>
        </details>
      )}
    </div>
  );
}