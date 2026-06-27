'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';

// ===== 类型定义 =====
interface PersonSummary {
  name: string;
  timeSlots: string[];
  totalHours: number;
  earlyMorningHours: number;
}

interface AccountData {
  accountName: string;
  personSummary: PersonSummary[];
  stats: { personCount: number; totalHours: number; earlyMorningHours: number };
}

interface DateData {
  date: string;
  display?: string;
  accounts: AccountData[];
}

interface GlobalStats {
  totalPersonDays: number;
  totalHours: number;
  totalEarlyMorning: number;
  totalDays: number;
}

interface ScheduleResponse {
  success: boolean;
  data: {
    dates: DateData[];
    globalStats: GlobalStats;
  };
}

// ===== 工具函数 =====
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days + 1);
  return d.toISOString().split('T')[0];
}

const ACCOUNT_COLORS: Record<string, string> = {
  'vivo（大号）': '#415FFF',
  'vivo官方旗舰店（抖音）': '#FF6B35',
  'vivo官方旗舰店（快手）': '#00C9A7',
};

// ===== 组件 =====
export default function SchedulePage() {
  // 日期区间（SSR安全：初始静态值，useEffect设今天）
  const [startDate, setStartDate] = useState('2026-06-01');
  const [endDate, setEndDate] = useState('2026-06-07');
  const [mounted, setMounted] = useState(false);

  const [scheduleData, setScheduleData] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDates, setExpandedDates] = useState<Record<string, string>>({});
  const [selectedPerson, setSelectedPerson] = useState('全部主播');

  // 客户端挂载后设置今天日期
  useEffect(() => {
    setStartDate(getDaysAgo(6));
    setEndDate(getToday());
    setMounted(true);
  }, []);

  // 获取排班数据
  const fetchSchedule = useCallback(async (start: string, end: string) => {
    if (!start || !end) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/schedule?start=${start}&end=${end}`);
      const json: ScheduleResponse = await res.json();
      if (json.success) {
        setScheduleData(json);
      } else {
        setError(json.data ? '数据格式错误' : '获取数据失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  // 日期变化时自动获取
  useEffect(() => {
    if (mounted && startDate && endDate) {
      fetchSchedule(startDate, endDate);
    }
  }, [startDate, endDate, mounted, fetchSchedule]);

  const rawDates = scheduleData?.data?.dates || [];

  // 提取去重人员名单（必须在early return之前调用hook）
  const allPersons = useMemo(() => {
    const nameSet = new Set<string>();
    rawDates.forEach((d: { accounts?: { personSummary?: { name: string }[] }[] }) => {
      (d.accounts || []).forEach((a: { personSummary?: { name: string }[] }) => {
        (a.personSummary || []).forEach((p: { name: string }) => {
          if (p.name) nameSet.add(p.name);
        });
      });
    });
    return Array.from(nameSet).sort();
  }, [rawDates]);

  // 按选中主播筛选
  const dates = useMemo(() => {
    if (selectedPerson === '全部主播') return rawDates;
    return rawDates.map((d: { date: string; accounts?: { accountName: string; personSummary?: { name: string; totalHours: number; earlyMorningHours: number; timeSlots: string[] }[]; stats?: { personCount: number; totalHours: number; earlyMorningHours: number } }[] }) => ({
      ...d,
      accounts: (d.accounts || []).map((a: { accountName: string; personSummary?: { name: string; totalHours: number; earlyMorningHours: number; timeSlots: string[] }[]; stats?: { personCount: number; totalHours: number; earlyMorningHours: number } }) => {
        const filtered = (a.personSummary || []).filter((p: { name: string }) => p.name === selectedPerson);
        const personCount = filtered.length;
        const totalHours = filtered.reduce((s: number, p: { totalHours: number }) => s + (p.totalHours || 0), 0);
        const earlyMorningHours = filtered.reduce((s: number, p: { earlyMorningHours: number }) => s + (p.earlyMorningHours || 0), 0);
        return {
          ...a,
          personSummary: filtered,
          stats: { personCount, totalHours, earlyMorningHours },
        };
      }),
    }));
  }, [rawDates, selectedPerson]);

  // 根据筛选结果计算汇总
  const globalStats = useMemo(() => {
    if (selectedPerson === '全部主播' && scheduleData?.data?.globalStats) {
      return scheduleData.data.globalStats;
    }
    let totalDays = 0;
    let totalPersonDays = 0;
    let totalHours = 0;
    let totalEarlyMorning = 0;
    dates.forEach((d: { accounts?: { personSummary?: unknown[]; stats?: { personCount: number; totalHours: number; earlyMorningHours: number } }[] }) => {
      const hasPerson = (d.accounts || []).some((a: { personSummary?: unknown[] }) => (a.personSummary || []).length > 0);
      if (hasPerson) totalDays++;
      (d.accounts || []).forEach((a: { stats?: { personCount: number; totalHours: number; earlyMorningHours: number } }) => {
        totalPersonDays += (a.stats?.personCount || 0);
        totalHours += (a.stats?.totalHours || 0);
        totalEarlyMorning += (a.stats?.earlyMorningHours || 0);
      });
    });
    return { totalDays, totalPersonDays, totalHours, totalEarlyMorning };
  }, [dates, selectedPerson, scheduleData]);

  // 切换日期展开的账号Tab
  const toggleAccount = (dateStr: string, accountName: string) => {
    setExpandedDates(prev => ({
      ...prev,
      [dateStr]: prev[dateStr] === accountName ? '' : accountName,
    }));
  };

  if (!mounted) {
    return <div className="p-8 text-center text-zinc-500">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 p-6">
      <h1 className="text-2xl font-bold mb-6">排班管理</h1>

      {/* ===== 日期区间选择器 ===== */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <span className="text-sm text-zinc-400">日期范围</span>
        <input
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
        />
        <span className="text-zinc-500">~</span>
        <input
          type="date"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={() => { setStartDate(getDaysAgo(6)); setEndDate(getToday()); }}
          className="px-3 py-2 text-xs rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition"
        >近7天</button>
        <button
          onClick={() => {
            const d = new Date();
            const m = d.getMonth();
            const y = d.getFullYear();
            setStartDate(`${y}-${String(m + 1).padStart(2, '0')}-01`);
            setEndDate(getToday());
          }}
          className="px-3 py-2 text-xs rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition"
        >本月</button>
        <button
          onClick={() => fetchSchedule(startDate, endDate)}
          className="px-4 py-2 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition font-medium"
        >刷新</button>

        {/* 主播筛选 */}
        <div className="flex items-center gap-2 ml-4">
          <span className="text-sm text-zinc-400">主播筛选</span>
          <select
            value={selectedPerson}
            onChange={e => setSelectedPerson(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none min-w-[140px]"
          >
            <option value="全部主播">全部主播</option>
            {allPersons.map((name: string) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ===== 全局汇总卡片 ===== */}
      {globalStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="覆盖天数" value={globalStats.totalDays} suffix="天" color="#4facfe" />
          <StatCard label="排班人次" value={globalStats.totalPersonDays} suffix="人次" color="#66df7c" />
          <StatCard label="总时长" value={globalStats.totalHours} suffix="小时" color="#f093fb" />
          <StatCard label="凌晨班时长" value={globalStats.totalEarlyMorning} suffix="小时" color="#ffb84d" />
        </div>
      )}

      {/* ===== 加载/错误状态 ===== */}
      {loading && <div className="text-center py-10 text-zinc-400">加载排班数据中...</div>}
      {error && <div className="text-center py-10 text-red-400">{error}</div>}

      {/* ===== 按日期分组展示 ===== */}
      {!loading && !error && dates.length > 0 && (
        <div className="space-y-4">
          {dates.map((dateItem: DateData) => (
            <DateGroup
              key={dateItem.date}
              dateItem={dateItem}
              expandedAccount={expandedDates[dateItem.date] || ''}
              onToggleAccount={(accName) => toggleAccount(dateItem.date, accName)}
            />
          ))}
        </div>
      )}

      {!loading && !error && dates.length === 0 && scheduleData && (
        <div className="text-center py-10 text-zinc-500">所选日期范围内暂无排班数据</div>
      )}
    </div>
  );
}

// ===== 汇总卡片 =====
function StatCard({ label, value, suffix, color }: { label: string; value: number; suffix: string; color: string }) {
  return (
    <div className="bg-zinc-800/60 rounded-xl p-4 border border-zinc-700/50">
      <div className="text-xs text-zinc-400 mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold" style={{ color }}>{value}</span>
        <span className="text-xs text-zinc-500">{suffix}</span>
      </div>
    </div>
  );
}

// ===== 日期分组 =====
function DateGroup({
  dateItem,
  expandedAccount,
  onToggleAccount,
}: {
  dateItem: DateData;
  expandedAccount: string;
  onToggleAccount: (name: string) => void;
}) {
  const totalPersons = dateItem.accounts.reduce((s, a) => s + (a.stats?.personCount || 0), 0);
  const totalHours = dateItem.accounts.reduce((s, a) => s + (a.stats?.totalHours || 0), 0);
  const totalEarly = dateItem.accounts.reduce((s, a) => s + (a.stats?.earlyMorningHours || 0), 0);
  const isWeekend = [0, 6].includes(new Date(dateItem.date).getDay());

  return (
    <div className="bg-zinc-800/40 rounded-xl border border-zinc-700/40 overflow-hidden">
      {/* 日期头 */}
      <div className={`px-4 py-3 flex items-center justify-between border-b border-zinc-700/30 ${isWeekend ? 'bg-orange-900/10' : ''}`}>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-semibold ${isWeekend ? 'text-orange-400' : 'text-zinc-200'}`}>
            {dateItem.display || dateItem.date}
          </span>
          {totalEarly > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
              凌晨班 {totalEarly}h
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <span>{totalPersons} 人次</span>
          <span>{totalHours} 小时</span>
        </div>
      </div>

      {/* 账号Tab */}
      <div className="flex gap-1 px-4 pt-3">
        {dateItem.accounts.map(account => {
          const color = ACCOUNT_COLORS[account.accountName] || '#667eea';
          const isActive = expandedAccount === account.accountName;
          const personCount = account.stats?.personCount || 0;
          return (
            <button
              key={account.accountName}
              onClick={() => onToggleAccount(account.accountName)}
              className="px-3 py-1.5 text-xs rounded-t-lg transition font-medium"
              style={{
                background: isActive ? `${color}22` : 'transparent',
                color: isActive ? color : 'rgba(255,255,255,0.5)',
                borderBottom: isActive ? `2px solid ${color}` : '2px solid transparent',
              }}
            >
              {account.accountName}
              <span className="ml-1 opacity-60">({personCount})</span>
            </button>
          );
        })}
      </div>

      {/* 人员明细 */}
      {expandedAccount && (() => {
        const account = dateItem.accounts.find(a => a.accountName === expandedAccount);
        if (!account) return null;
        const persons = account.personSummary || [];
        const color = ACCOUNT_COLORS[account.accountName] || '#667eea';
        return (
          <div className="px-4 pb-4 pt-2">
            {persons.length === 0 ? (
              <div className="text-center py-4 text-zinc-500 text-sm">暂无排班人员</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {persons.map(person => (
                  <PersonDetailCard key={person.name} person={person} color={color} />
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ===== 人员明细卡片 =====
function PersonDetailCard({ person, color }: { person: PersonSummary; color: string }) {
  const hasEarlyMorning = (person.earlyMorningHours || 0) > 0;

  return (
    <div className="bg-zinc-800/60 rounded-lg p-3 border border-zinc-700/30 hover:border-zinc-600/50 transition">
      {/* 头部：名字 + 时长 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${color}, ${color}88)` }}
          >
            {person.name.slice(0, 1)}
          </div>
          <span className="text-sm font-medium text-zinc-100">{person.name}</span>
          {hasEarlyMorning && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
              凌晨{person.earlyMorningHours}h
            </span>
          )}
        </div>
        <span className="text-sm font-semibold text-blue-400">{person.totalHours}h</span>
      </div>

      {/* 时间段标签 */}
      <div className="flex flex-wrap gap-1">
        {(person.timeSlots || []).map((slot, idx) => {
          const isEarly = ['2-3点', '3-4点', '4-5点', '5-6点', '6-7点', '7-8点'].includes(slot);
          return (
            <span
              key={idx}
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                isEarly
                  ? 'bg-orange-500/20 text-orange-400'
                  : 'bg-zinc-700/50 text-zinc-400'
              }`}
            >
              {slot}
            </span>
          );
        })}
      </div>
    </div>
  );
}
