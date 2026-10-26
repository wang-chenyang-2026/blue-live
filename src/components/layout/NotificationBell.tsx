'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, Check } from 'lucide-react';

interface Noti {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Noti[]>([]);
  const [loaded, setLoaded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/notifications', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (alive && json.success) setList(json.data || []);
      } catch {
        /* 静默失败 */
      } finally {
        if (alive) setLoaded(true);
      }
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const markAllRead = async () => {
    if (!list.length) return;
    try {
      await fetch('/api/notifications', { method: 'POST' });
      setList([]);
    } catch {
      /* 忽略 */
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        className="relative rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-label="通知"
      >
        <Bell className="h-4 w-4" />
        {loaded && list.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none text-white">
            {list.length > 99 ? '99+' : list.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-medium">通知</span>
            {list.length > 0 && (
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={markAllRead}
              >
                <Check className="h-3 w-3" /> 全部已读
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {!loaded ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">加载中…</p>
            ) : list.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">暂无新通知</p>
            ) : (
              list.map((n) => (
                <div key={n.id} className="border-b border-border px-3 py-2 last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatTime(n.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{n.content}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}