'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/contexts/AppContext';
import { AppShell } from '@/components/layout/AppShell';
import { getAccessibleModules, PATH_TO_MODULE, MODULE_PATHS } from '@/lib/constants';
import { useEffect } from 'react';

const PUBLIC_PATHS = ['/login', '/register'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isClient, isAuthenticated, currentRole, currentUser } = useApp();

  const resolvedRole = currentRole || currentUser?.role;
  const allowedModules = getAccessibleModules(resolvedRole, currentUser?.phone);

  // 路径匹配：先精确匹配，再前缀匹配（处理子路由如 /market-monitor/ecommerce）
  const getModuleForPath = (path: string) => {
    if (PATH_TO_MODULE[path]) return PATH_TO_MODULE[path];
    // 前缀匹配（长路径优先）
    const sortedPaths = Object.keys(PATH_TO_MODULE).sort((a, b) => b.length - a.length);
    for (const p of sortedPaths) {
      if (p !== '/' && path.startsWith(p)) return PATH_TO_MODULE[p];
    }
    return null;
  };

  const requiredModule = getModuleForPath(pathname);
  const hasAccess = !requiredModule || allowedModules.includes(requiredModule);

  useEffect(() => {
    if (!isClient) return;

    if (!isAuthenticated && !PUBLIC_PATHS.includes(pathname)) {
      router.replace('/login');
      return;
    }

    if (isAuthenticated && PUBLIC_PATHS.includes(pathname)) {
      router.replace('/');
      return;
    }

    // 已登录但无权限访问当前页面 → 重定向到第一个有权限的模块
    if (isAuthenticated && !hasAccess && allowedModules.length > 0) {
      const firstModule = allowedModules[0];
      const targetPath = MODULE_PATHS[firstModule] || '/';
      if (pathname !== targetPath) {
        router.replace(targetPath);
      }
    }
  }, [isClient, isAuthenticated, pathname, router, hasAccess, allowedModules]);

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

  // 无权限时不渲染页面内容（等待重定向）
  if (!hasAccess) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
