'use client';

import { useApp } from '@/contexts/AppContext';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { Bell } from 'lucide-react';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isClient, isAuthenticated } = useApp();

  // SSR 和 CSR 初始渲染一致的加载状态
  if (!isClient) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  // 未认证 -> 不渲染 shell，由 layout 中的 AuthGuard 处理重定向
  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">正在跳转登录...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <AppSidebar />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-end border-b border-border bg-card px-6">
          <div className="flex items-center gap-3">
            <div className="h-5 w-px bg-border" />
            <button className="relative rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>

        {/* Footer */}
        <footer className="border-t border-border bg-card px-6 py-3 text-center text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <span>COPYRIGHT©BLUEXH.COM 蓝色星合传媒科技（北京）有限公司</span>
            <a href="https://beian.mps.gov.cn/#/query/webSearch?code=1101050204959597" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">
              京公网安备 1101050204959597号
            </a>
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">
              京ICP备20220122255号-2
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
