'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function MarketMonitorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[MarketMonitor ErrorBoundary]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 mb-6">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">数据加载异常</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-2">
        市场数据服务暂时不可用，可能是数据源接口异常。您可以尝试刷新，或稍后再试。
      </p>
      {error?.message && (
        <p className="text-xs text-muted-foreground/60 text-center max-w-lg mb-6 font-mono bg-muted/30 px-3 py-2 rounded">
          {error.message.slice(0, 200)}
        </p>
      )}
      <button
        onClick={reset}
        className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <RefreshCw className="h-4 w-4" />
        重新加载
      </button>
    </div>
  );
}
