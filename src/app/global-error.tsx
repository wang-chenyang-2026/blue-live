'use client';

import { useEffect } from 'react';

/**
 * 全局错误边界：当错误逃逸出页面级 error.tsx（如根布局、hydration 阶段、
 * 部署后浏览器长开标签页的新旧 chunk 错位）时兜底。
 * 注意：global-error 会替换根 layout，因此必须自带 <html>/<body>，
 * 且样式内联，避免依赖可能加载失败的全局资源。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  const hardReload = () => {
    // 整页刷新，强制拉取与当前 HTML 匹配的最新 chunk，
    // 解决系统更新后浏览器缓存旧 JS 导致的资源错位
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          background: '#0a0a0f',
          color: '#e5e7eb',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        }}
      >
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '44px', marginBottom: '18px' }}>
            ⚠️
          </div>
          <h1
            style={{
              fontSize: '20px',
              fontWeight: 600,
              margin: '0 0 10px',
            }}
          >
            页面加载出现问题
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: '#9ca3af',
              maxWidth: '440px',
              margin: '0 0 28px',
              lineHeight: 1.7,
            }}
          >
            系统更新后，浏览器可能缓存了旧版本资源导致页面异常。
            请先点击「重新加载」整页刷新；若仍异常，请按
            <strong style={{ color: '#d1d5db' }}> Ctrl/Cmd + Shift + R </strong>
            强制刷新，或清除浏览器缓存后重试。
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={hardReload}
              style={{
                padding: '10px 26px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg,#4158D0,#4361EE)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              重新加载
            </button>
            <button
              onClick={() => reset()}
              style={{
                padding: '10px 26px',
                borderRadius: '10px',
                border: '1px solid #374151',
                background: 'transparent',
                color: '#e5e7eb',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              重试
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
