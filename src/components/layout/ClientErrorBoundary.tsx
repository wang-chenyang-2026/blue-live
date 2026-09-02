'use client';

import React from 'react';

interface State {
  hasError: boolean;
  message: string;
  stack: string;
}

export class ClientErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '', stack: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const err = error as Error;
    return {
      hasError: true,
      message: err?.message || String(error),
      stack: err?.stack || '',
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[ClientErrorBoundary]', error, info);
    try {
      const payload = {
        message: (error as Error)?.message || String(error),
        stack: (error as Error)?.stack || '',
        componentStack: info?.componentStack || '',
        url: typeof window !== 'undefined' ? window.location.href : '',
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        time: new Date().toISOString(),
      };
      localStorage.setItem('lm_last_client_error', JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e5e7eb', padding: '32px 24px', fontFamily: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif' }}>
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            <div style={{ fontSize: '40px', marginBottom: '14px' }}>⚠️</div>
            <h1 style={{ fontSize: '19px', fontWeight: 600, margin: '0 0 12px' }}>页面渲染异常（已捕获）</h1>
            <p style={{ fontSize: '14px', color: '#f87171', margin: '0 0 16px', wordBreak: 'break-all' }}>{this.state.message}</p>
            <pre style={{ background: '#111118', border: '1px solid #26262e', borderRadius: '10px', padding: '14px', fontSize: '12px', lineHeight: 1.6, color: '#9ca3af', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '50vh' }}>{this.state.stack || '（无堆栈信息）'}</pre>
            <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
              <button onClick={() => window.location.reload()} style={{ padding: '9px 22px', borderRadius: '9px', border: 'none', background: 'linear-gradient(135deg,#4158D0,#4361EE)', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>重新加载</button>
              <button onClick={() => this.setState({ hasError: false, message: '', stack: '' })} style={{ padding: '9px 22px', borderRadius: '9px', border: '1px solid #374151', background: 'transparent', color: '#e5e7eb', fontSize: '14px', cursor: 'pointer' }}>重试</button>
            </div>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '22px' }}>请把本页完整截图发给管理员，错误详情已保存在浏览器本地（lm_last_client_error）。</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
