'use client';

import { useEffect } from 'react';

/**
 * 在客户端通过 useEffect 设置 dark class 到 <html> 上。
 * 避免 SSR 时硬编码 className 导致 Hydration 不匹配。
 * 使用 suppressHydrationWarning 让 <html> 标签允许属性差异。
 */
export function ThemeSetter() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return null;
}
