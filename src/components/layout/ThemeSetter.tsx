'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'blue-theme';

/**
 * 在客户端通过 useEffect 设置 dark class 到 <html> 上。
 * 读取 localStorage 中的主题偏好，默认 'dark'。
 * 使用 suppressHydrationWarning 让 <html> 标签允许属性差异。
 */
export function ThemeSetter() {
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const isLight = stored === 'light';
    document.documentElement.classList.toggle('dark', !isLight);
  }, []);

  return null;
}
