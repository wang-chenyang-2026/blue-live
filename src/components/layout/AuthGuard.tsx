'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/contexts/AppContext';
import { AppShell } from '@/components/layout/AppShell';
import { useEffect } from 'react';

const PUBLIC_PATHS = ['/login', '/register'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isClient, isAuthenticated } = useApp();

  useEffect(() => {
    if (!isClient) return;

    if (!isAuthenticated && !PUBLIC_PATHS.includes(pathname)) {
      router.replace('/login');
    }

    if (isAuthenticated && PUBLIC_PATHS.includes(pathname)) {
      router.replace('/');
    }
  }, [isClient, isAuthenticated, pathname, router]);

  // SSR 和首次 CSR 渲染一致：不渲染任何内容
  if (!isClient) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // 公开页面（登录/注册）- 不使用 AppShell
  if (PUBLIC_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  // 需要认证的页面 - 使用 AppShell
  if (!isAuthenticated) {
    return null; // 等待重定向
  }

  return <AppShell>{children}</AppShell>;
}
