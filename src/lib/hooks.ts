import { useState, useEffect } from 'react';

/**
 * 安全获取客户端日期的 hook。
 * SSR 阶段返回空字符串，避免 new Date() 导致 hydration 不匹配。
 * 客户端 useEffect 中设置真实日期值。
 */
export function useSafeDate(): string {
  const [today, setToday] = useState('');
  useEffect(() => {
    setToday(new Date().toISOString().split('T')[0]);
  }, []);
  return today;
}

/**
 * 安全获取客户端月份的 hook。
 * 格式：YYYY-MM
 */
export function useSafeMonth(): string {
  const [month, setMonth] = useState('');
  useEffect(() => {
    const now = new Date();
    setMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  }, []);
  return month;
}
