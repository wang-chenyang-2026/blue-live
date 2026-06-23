'use client';

import { useApp } from '@/contexts/AppContext';
import { AppSidebar, RoleSwitcher, BrandSwitcher } from '@/components/layout/AppSidebar';
import { Bell } from 'lucide-react';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isClient } = useApp();

  // SSR 阶段渲染一个与 CSR 初始渲染一致的空壳结构
  // 避免因 isClient 状态变化导致的 DOM 结构不匹配
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

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <AppSidebar />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
          <BrandSwitcher />
          <div className="flex items-center gap-3">
            <RoleSwitcher />
            <div className="h-5 w-px bg-border" />
            <button className="relative rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
              <Bell className="h-4 w-4" />
              <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-destructive" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
