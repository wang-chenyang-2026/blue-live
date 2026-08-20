'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[MarketMonitor GlobalError]', error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
          <h2 className="text-xl font-semibold mb-2">页面加载异常</h2>
          <p className="text-sm text-muted-foreground mb-6">市场监测模块遇到问题，请尝试重新加载。</p>
          <button
            onClick={reset}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            重新加载
          </button>
        </div>
      </body>
    </html>
  );
}
