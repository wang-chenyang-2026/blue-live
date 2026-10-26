'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';

export type DateRange = { start: string; end: string };

export function toDateStr(d: Date): string {
  // Use local date parts — toISOString() is UTC and shifts early-morning
  // local dates (e.g. the 1st of a month, 00:xx in UTC+8) back one day.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Parse a YYYY-MM-DD string as local date (new Date('YYYY-MM-DD') is UTC).
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function formatDateDisplay(iso: string): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${parseInt(m, 10)}月${parseInt(d, 10)}日`;
}

export interface DateRangeQuickOption {
  key: string;
  label: string;
  isActive: boolean;
  select: () => void;
}

interface DateRangePickerProps {
  start: string;
  end: string;
  /** 可选：日期控件可选的最大日期（YYYY-MM-DD） */
  today?: string;
  /** 可选：弹出面板里展示的快捷选项；不传则只保留自定义起止 */
  quickOptions?: DateRangeQuickOption[];
  onApply: (range: DateRange) => void;
}

/**
 * 单个连续日期范围选择器（日历图标 + 「M月D日 - M月D日」+ 弹出面板选起止）。
 * 数据概览/数据分析两页共用，避免各自演化。
 */
export function DateRangePicker({ start, end, today, quickOptions, onApply }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [tempStart, setTempStart] = useState(start);
  const [tempEnd, setTempEnd] = useState(end);

  // 关闭时把面板内暂存的起止同步回受控范围
  useEffect(() => {
    if (!open) {
      setTempStart(start);
      setTempEnd(end);
    }
  }, [open, start, end]);

  const apply = () => {
    if (!tempStart || !tempEnd) return;
    let s = parseLocalDate(tempStart);
    let e = parseLocalDate(tempEnd);
    const maxEnd = addDays(s, 365);
    if (e > maxEnd) e = maxEnd;
    if (s > e) [s, e] = [e, s];
    onApply({ start: toDateStr(s), end: toDateStr(e) });
    setOpen(false);
  };

  const handleQuick = (opt: DateRangeQuickOption) => {
    opt.select();
    setOpen(false);
  };

  const display = start && end ? `${formatDateDisplay(start)} - ${formatDateDisplay(end)}` : '选择日期';

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="gap-2 border-zinc-600 text-zinc-300 hover:bg-zinc-800"
        onClick={() => setOpen(!open)}
      >
        <CalendarIcon className="h-4 w-4" />
        {display}
      </Button>
      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-zinc-900 border border-zinc-700 rounded-lg p-4 shadow-xl min-w-[280px]">
          {quickOptions && quickOptions.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {quickOptions.map((opt) => (
                <Button
                  key={opt.key}
                  variant={opt.isActive ? 'default' : 'outline'}
                  size="sm"
                  className={opt.isActive ? 'bg-[#4158D0]' : 'border-zinc-600 text-zinc-300'}
                  onClick={() => handleQuick(opt)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400 w-12">开始</label>
              <input
                type="date"
                value={tempStart}
                max={today || undefined}
                onChange={(e) => setTempStart(e.target.value)}
                className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-zinc-200 flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400 w-12">结束</label>
              <input
                type="date"
                value={tempEnd}
                max={today || undefined}
                onChange={(e) => setTempEnd(e.target.value)}
                className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-zinc-200 flex-1"
              />
            </div>
            <Button size="sm" className="w-full bg-[#4158D0] mt-2" onClick={apply}>
              应用
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}