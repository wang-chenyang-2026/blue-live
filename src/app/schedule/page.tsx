'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

// ===== 类型定义（与 /api/schedule 返回保持一致） =====
interface PersonSummary {
  name: string;
  timeSlots: string[];
  totalHours: number;
  earlyMorningHours: number;
  dualBroadcastHours: number;
}

interface AccountData {
  accountName: string;
  personSummary: PersonSummary[];
  stats: {
    personCount: number;
    totalHours: number;
    earlyMorningHours: number;
    dualBroadcastHours: number;
  };
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
  totalDualBroadcast: number;
  totalDays: number;
}

interface ScheduleResponse {
  success: boolean;
  data: {
    dates: DateData[];
    globalStats: GlobalStats;
    brand: string;
    role: string;
  };
  error?: string;
}

// ===== 工具函数 =====
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseLocal(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

function getToday(): string {
  return localDateStr(new Date());
}

function addDays(dateStr: string, n: number): string {
  const d = parseLocal(dateStr);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function getDaysAgo(days: number): string {
  return addDays(getToday(), -(days - 1));
}

// 本周周一
function weekMonday(base: Date): string {
  const d = new Date(base);
  const offset = (d.getDay() + 6) % 7; // 周一=0
  d.setDate(d.getDate() - offset);
  return localDateStr(d);
}

// [start, end] 区间内所有日期
function getDatesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = parseLocal(start); d <= parseLocal(end); d.setDate(d.getDate() + 1)) {
    out.push(localDateStr(d));
  }
  return out;
}

const WEEKDAYS_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 时段起始小时（如 "8-9点" → 8，无法解析 → -1）
function slotStartHour(slot: string): number {
  const m = slot.match(/^(\d{1,2})-/);
  if (!m) return -1;
  return parseInt(m[1], 10);
}

// 取一个人的全部时段起止范围，用于周视图标签（如 "00:00-24:00"）
function personRangeLabel(slots: string[]): string {
  if (slots.length === 0) return '';
  let minH = 24;
  let maxH = 0;
  for (const s of slots) {
    const h = slotStartHour(s);
    if (h >= 0) {
      if (h < minH) minH = h;
      if (h + 1 > maxH) maxH = h + 1;
    }
  }
  if (minH === 24) return '';
  return `${String(minH).padStart(2, '0')}:00-${String(maxH).padStart(2, '0')}:00`;
}

function formatHms(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

// 渠道名 → 业务线（仅用于中性徽章展示）
function brandOfChannel(name: string): string {
  if (name.startsWith('vivo')) return 'vivo';
  if (name.startsWith('iQOO')) return 'iQOO';
  return 'IOT';
}

// 中性业务线徽章
function BrandBadge({ brand }: { brand: string }) {
  return (
    <span className="inline-flex items-center rounded bg-[#2A2E45] px-1.5 py-0.5 text-[11px] font-normal leading-none text-white/[0.92]">
      {brand}
    </span>
  );
}

// 渠道简称（日视图角标/明细展示用，仅展示层）
const CHANNEL_SHORT_NAMES: Record<string, string> = {
  'vivo（大号）': 'vivo大号',
  'vivo官方旗舰店（抖音）': '抖音',
  'vivo官方旗舰店（快手）': '快手',
  'iQOO手机（快手）': 'iQOO快手',
  'iQOO手机（抖音）': 'iQOO抖音',
  'iQOO官方旗舰店（抖音）': 'iQOO抖音',
};
function shortChannel(name: string): string {
  return CHANNEL_SHORT_NAMES[name] || name;
}

// ===== 悬浮详情 =====
function HoverCard({ person, channel }: { person: PersonSummary; channel: string }) {
  const rows: { label: string; node: React.ReactNode }[] = [
    { label: '主播', node: <span className="text-white/[0.92]">{person.name}</span> },
    { label: '起止时段', node: <span className="text-white/[0.92]">{personRangeLabel(person.timeSlots)}</span> },
    { label: '实际时长', node: <span className="text-white/[0.92]">{person.totalHours}h</span> },
    { label: '账号渠道', node: <span className="text-white/[0.92]">{channel}</span> },
    { label: '业务线', node: <BrandBadge brand={brandOfChannel(channel)} /> },
  ];
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-52 -translate-x-1/2 rounded-xl border border-white/[0.08] bg-[#1E2235] p-3 shadow-2xl opacity-0 transition-opacity duration-150 group-hover:opacity-100">
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-white/[0.40]">{r.label}</span>
            {r.node}
          </div>
        ))}
      </div>
      <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 rotate-45 -mt-1 bg-[#1E2235] border-r border-b border-white/[0.08]" />
    </div>
  );
}

// ===== 主组件 =====
export default function SchedulePage() {
  const { getVisibleBrands, currentRole } = useApp();
  const isExternal = currentRole === '外部合作';

  // 品牌（含「全部」聚合选项）与角色
  const [brandFilter, setBrandFilter] = useState<'全部' | 'vivo' | 'iQOO'>('vivo');
  const [role, setRole] = useState<'anchor' | 'control'>('anchor');

  const availableBrands = useMemo(() => {
    const allowed = getVisibleBrands('schedule');
    const opts: { id: 'vivo' | 'iQOO'; label: string }[] = [];
    if (allowed.includes('vivo')) opts.push({ id: 'vivo', label: 'vivo' });
    if (allowed.includes('iqoo')) opts.push({ id: 'iQOO', label: 'iQOO' });
    return opts;
  }, [getVisibleBrands]);

  // 默认本周一~周日（今天所在自然周）
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [mounted, setMounted] = useState(false);

  const [scheduleData, setScheduleData] = useState<{ dates: DateData[]; globalStats: GlobalStats } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'month' | 'day'>('month');
  const [isMonthLabel, setIsMonthLabel] = useState(false);

  useEffect(() => {
    const mon = weekMonday(new Date());
    setStartDate(mon);
    setEndDate(addDays(mon, 6));
    setMounted(true);
  }, []);

  // 当前要拉取的真实品牌 id（「全部」= 两个品牌分别请求后在前端聚合，统计口径不变）
  const activeBrandIds = useMemo(() => {
    if (brandFilter === '全部') return availableBrands.map((b) => b.id);
    return [brandFilter];
  }, [brandFilter, availableBrands]);

  const fetchSchedule = useCallback(async (start: string, end: string, b: string, r: string) => {
    if (!start || !end) return;
    setLoading(true);
    setError(null);
    try {
      // 「全部」品牌：分别请求每个可用品牌再前端聚合（每个品牌的统计口径不变）
      const ids = (b === '全部' ? availableBrands.map((x) => x.id) : [b as 'vivo' | 'iQOO']);
      const results = await Promise.all(
        ids.map(async (id) => {
          const res = await fetch(`/api/schedule?start=${start}&end=${end}&brand=${id}&role=${r}`);
          const json: ScheduleResponse = await res.json();
          if (!json.success) return null;
          return json.data;
        }),
      );
      const valid = results.filter((x): x is NonNullable<typeof x> => !!x);
      if (valid.length === 0) {
        setError('获取数据失败');
        return;
      }
      // 按日期合并 accounts
      const byDate = new Map<string, AccountData[]>();
      for (const res of valid) {
        for (const d of res.dates) {
          byDate.set(d.date, [...(byDate.get(d.date) || []), ...d.accounts]);
        }
      }
      const mergedDates: DateData[] = getDatesBetween(start, end)
        .filter((day) => byDate.has(day))
        .map((day) => ({ date: day, display: undefined, accounts: byDate.get(day) || [] }));
      const globalStats = valid.reduce<GlobalStats>(
        (acc, res) => {
          acc.totalPersonDays += res.globalStats.totalPersonDays;
          acc.totalHours += res.globalStats.totalHours;
          acc.totalEarlyMorning += res.globalStats.totalEarlyMorning;
          acc.totalDualBroadcast += res.globalStats.totalDualBroadcast;
          return acc;
        },
        { totalPersonDays: 0, totalHours: 0, totalEarlyMorning: 0, totalDualBroadcast: 0, totalDays: getDatesBetween(start, end).length },
      );
      setScheduleData({ dates: mergedDates, globalStats });
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }, [availableBrands]);

  useEffect(() => {
    if (mounted && startDate && endDate) {
      fetchSchedule(startDate, endDate, brandFilter, role);
    }
  }, [startDate, endDate, mounted, brandFilter, role, fetchSchedule]);

  const rawDates = scheduleData?.dates || [];

  // 全部渠道（用于周视图行 / 缺口判定，不受搜索影响）
  const channels = useMemo(() => {
    const seen: string[] = [];
    for (const d of rawDates) {
      for (const a of d.accounts) {
        if (!seen.includes(a.accountName)) seen.push(a.accountName);
      }
    }
    return seen;
  }, [rawDates]);

  // 按主播搜索过滤（仅过滤展示明细；缺口判定基于未过滤数据）
  const viewDates = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return rawDates;
    return rawDates.map<DateData>((d) => ({
      ...d,
      accounts: d.accounts
        .map((a) => ({
          ...a,
          personSummary: a.personSummary.filter((p) => p.name.includes(q)),
          stats: (() => {
            const list = a.personSummary.filter((p) => p.name.includes(q));
            return {
              personCount: list.length,
              totalHours: list.reduce((s, p) => s + p.totalHours, 0),
              earlyMorningHours: list.reduce((s, p) => s + p.earlyMorningHours, 0),
              dualBroadcastHours: list.reduce((s, p) => s + p.dualBroadcastHours, 0),
            };
          })(),
        }))
        .filter((a) => a.stats.personCount > 0),
    }));
  }, [rawDates, searchQuery]);

  // 汇总六项（口径与现状完全一致）
  const summary = useMemo(() => {
    if (scheduleData && !searchQuery.trim()) {
      const g = scheduleData.globalStats;
      return {
        totalDays: g.totalDays,
        totalPersonDays: g.totalPersonDays,
        totalHours: g.totalHours,
        regularHours: g.totalHours - g.totalEarlyMorning,
        earlyMorningHours: g.totalEarlyMorning,
        dualBroadcastHours: g.totalDualBroadcast,
      };
    }
    if (!scheduleData) return null;
    let totalDays = 0;
    let totalPersonDays = 0;
    let totalHours = 0;
    let totalEarly = 0;
    let totalDual = 0;
    for (const d of scheduleData.dates) {
      let hasPerson = false;
      for (const a of d.accounts) {
        totalPersonDays += a.stats.personCount;
        totalHours += a.stats.totalHours;
        totalEarly += a.stats.earlyMorningHours;
        totalDual += a.stats.dualBroadcastHours;
        if (a.stats.personCount > 0) hasPerson = true;
      }
      if (hasPerson) totalDays++;
    }
    return {
      totalDays,
      totalPersonDays,
      totalHours,
      regularHours: totalHours - totalEarly,
      earlyMorningHours: totalEarly,
      dualBroadcastHours: totalDual,
    };
  }, [scheduleData, searchQuery]);

  // 周视图缺口：某渠道×某天在未过滤数据中完全无排班 → 缺口
  const weekGapCount = useMemo(() => {
    const days = getDatesBetween(startDate, endDate);
    let n = 0;
    for (const ch of channels) {
      for (const day of days) {
        const d = rawDates.find((x) => x.date === day);
        const acc = d?.accounts.find((a) => a.accountName === ch);
        if (!acc || acc.personSummary.length === 0) n++;
      }
    }
    return n;
  }, [channels, rawDates, startDate, endDate]);

  const weekDays = useMemo(() => getDatesBetween(startDate, endDate), [startDate, endDate]);
  const todayStr = getToday();
  const gapLabel = `${isMonthLabel ? '本月' : '本周期'}缺口 ${weekGapCount} 处`;
  const roleLabel = role === 'anchor' ? '主播' : '中控';

  // 一周视图内某天某渠道的排班对象（过滤后）
  const personsOf = (day: string, channel: string): PersonSummary[] => {
    const d = viewDates.find((x) => x.date === day);
    const acc = d?.accounts.find((a) => a.accountName === channel);
    return acc ? acc.personSummary : [];
  };
  const unfilteredPersonsOf = (day: string, channel: string): PersonSummary[] => {
    const d = rawDates.find((x) => x.date === day);
    const acc = d?.accounts.find((a) => a.accountName === channel);
    return acc ? acc.personSummary : [];
  };

  const quick7d = () => {
    setIsMonthLabel(false);
    setStartDate(getDaysAgo(6));
    setEndDate(getToday());
  };
  const quickMonth = () => {
    setIsMonthLabel(true);
    const now = new Date();
    setStartDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
    setEndDate(getToday());
  };
  const onStartChanged = (v: string) => {
    setIsMonthLabel(false);
    setStartDate(v);
  };
  const onEndChanged = (v: string) => {
    setIsMonthLabel(false);
    setEndDate(v);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-background p-8 text-center text-white/[0.40]">加载中...</div>;
  }

  const filterItem =
    'h-9 rounded-lg border border-white/[0.08] bg-[#151827] px-3 text-sm text-white/[0.92] outline-none transition focus:border-[#4158D0]';

  return (
    <div className="min-h-screen bg-[#0D0F1A] text-foreground">
      <div className="mx-auto max-w-[1440px] space-y-6 px-6 py-6">
        {/* L1 页面标题 */}
        <h1 className="text-[20px] font-medium text-white/[0.92]">排班管理</h1>

        {/* ===== 筛选栏（外露 ≤4：业务线 / 角色 / 日期快捷 / 搜索 + 刷新 + 更多筛选） ===== */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-[#151827] px-4 py-3">
            {/* 业务线 */}
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value as typeof brandFilter)}
              className={filterItem}
              aria-label="业务线"
            >
              {availableBrands.length > 1 && <option value="全部">全部</option>}
              {availableBrands.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>

            {/* 角色 */}
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className={filterItem}
              aria-label="角色"
            >
              <option value="anchor">主播</option>
              <option value="control">中控</option>
            </select>

            {/* 日期快捷 */}
            {/* 日期区间 */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => onStartChanged(e.target.value)}
                className={`${filterItem} bg-[#1E2235]`}
                aria-label="开始日期"
              />
              <span className="text-white/[0.40]">~</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => onEndChanged(e.target.value)}
                className={`${filterItem} bg-[#1E2235]`}
                aria-label="结束日期"
              />
            </div>

            {/* 日期快捷 */}
            <div className="flex items-center gap-1">
              <button
                onClick={quick7d}
                className="h-9 rounded-lg px-3 text-sm text-white/[0.65] transition hover:bg-white/[0.05] hover:text-white/[0.92]"
              >
                近7天
              </button>
              <button
                onClick={quickMonth}
                className="h-9 rounded-lg px-3 text-sm text-white/[0.65] transition hover:bg-white/[0.05] hover:text-white/[0.92]"
              >
                本月
              </button>
            </div>

            {/* 主播搜索 */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/[0.40]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`搜索${roleLabel}`}
                className={`${filterItem} pl-8 w-44`}
              />
            </div>

            <button
              onClick={() => fetchSchedule(startDate, endDate, brandFilter, role)}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-[#4158D0] px-3 text-sm font-medium text-white transition hover:bg-[#6A7CDA] active:bg-[#2C42B2]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </button>
          </div>
        </div>

        {/* ===== 汇总六项（两组） ===== */}
        {summary && (
          <div className="space-y-4">
            <SummaryGroup title="规模" items={[
              { name: '覆盖天数', value: summary.totalDays, unit: '天' },
              { name: '排班人次', value: summary.totalPersonDays, unit: '人次' },
              { name: '总时长', value: summary.totalHours, unit: 'h' },
            ]} />
            <SummaryGroup title="结构" items={[
              { name: '常规班', value: summary.regularHours, unit: 'h' },
              { name: '凌晨班', value: summary.earlyMorningHours, unit: 'h' },
              { name: '双播', value: summary.dualBroadcastHours, unit: 'h' },
            ]} />
          </div>
        )}

        {/* ===== 视图切换 ===== */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center rounded-lg border border-white/[0.08] bg-[#151827] p-1">
            <button
              onClick={() => setView('month')}
              className={`h-8 rounded-md px-4 text-sm transition ${
                view === 'month' ? 'bg-[#4158D0] font-medium text-white' : 'text-white/[0.65] hover:text-white/[0.92]'
              }`}
            >
              月视图
            </button>
            <button
              onClick={() => setView('day')}
              className={`h-8 rounded-md px-4 text-sm transition ${
                view === 'day' ? 'bg-[#4158D0] font-medium text-white' : 'text-white/[0.65] hover:text-white/[0.92]'
              }`}
            >
              日视图
            </button>
          </div>
        </div>

        {/* ===== 加载 / 错误 ===== */}
        {loading && <div className="py-10 text-center text-white/[0.40]">加载排班数据中...</div>}
        {error && <div className="py-10 text-center text-[#FF9F0A]">{error}</div>}

        {/* ===== 视图主体 ===== */}
        {!loading && !error && (isExternal ? (
          <div className="flex items-start gap-2 rounded-xl border border-white/[0.08] bg-[#151827] p-4 text-sm text-white/[0.65]">
            <span>ℹ️</span>
            <span>外部合作视图：仅展示页面格式，数据已隐藏。</span>
          </div>
        ) : (
          <div className="space-y-4">
            {view === 'month' ? (
              <MonthView
                channels={channels}
                weekDays={weekDays}
                todayStr={todayStr}
                gapLabel={gapLabel}
                personsOf={personsOf}
                unfilteredPersonsOf={unfilteredPersonsOf}
              />
            ) : (
              <DayView viewDates={viewDates} />
            )}
            {view === 'month' && weekDays.length === 0 && !loading && !error && (
              <div className="py-10 text-center text-white/[0.40]">所选日期范围内暂无排班数据</div>
            )}
            {view === 'day' && viewDates.length === 0 && !loading && !error && (
              <div className="py-10 text-center text-white/[0.40]">所选日期范围内暂无排班数据</div>
            )}
          </div>
        ))}

        </div>
    </div>
  );
}

// ===== 汇总组卡片（4段：组标题 L6灰 + 指标名 L5/T2 + 数值 L4/T1 + 单位 L6灰） =====
function SummaryGroup({
  title,
  items,
}: {
  title: string;
  items: { name: string; value: number; unit: string }[];
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {items.map((it) => (
        <div key={it.name} className="flex min-h-[88px] flex-col justify-between rounded-xl border border-white/[0.08] bg-[#1E2235] px-4 py-3.5">
          <span className="text-[12px] font-normal text-white/[0.40]">{title}</span>
          <div className="mt-1">
            <div className="text-[13px] text-white/[0.65]">{it.name}</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[20px] font-semibold tabular-nums text-white/[0.92]">{it.value}</span>
              <span className="text-[12px] text-white/[0.40]">{it.unit}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ===== 月视图 =====
function MonthView({
  channels,
  weekDays,
  todayStr,
  gapLabel,
  personsOf,
  unfilteredPersonsOf,
}: {
  channels: string[];
  weekDays: string[];
  todayStr: string;
  gapLabel: string;
  personsOf: (day: string, channel: string) => PersonSummary[];
  unfilteredPersonsOf: (day: string, channel: string) => PersonSummary[];
}) {
  if (channels.length === 0 || weekDays.length === 0) {
    return <div className="py-10 text-center text-white/[0.40]">所选范围内暂无排班数据</div>;
  }
  const colMinW = weekDays.length >= 7 ? 128 : Math.max(96, Math.floor(960 / weekDays.length));
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#1E2235]">
      {/* 顶部行：缺口计数 */}
      <div className="flex items-center justify-end border-b border-white/[0.08] px-4 py-2.5">
        <span className="text-[12px] text-white/[0.40]">{gapLabel}</span>
      </div>

      {/* 网格 */}
      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* 表头首列 + 天 */}
          <div className="grid items-stretch border-b border-white/[0.08]" style={{ gridTemplateColumns: `180px repeat(${weekDays.length}, minmax(${colMinW}px,1fr))` }}>
            <div className="flex items-center px-4 py-2.5 text-[12px] text-white/[0.40]">账号渠道</div>
            {weekDays.map((day) => {
              const isToday = day === todayStr;
              return (
                <div key={day} className="flex flex-col items-center justify-center border-l border-white/[0.08] py-2.5">
                  <span className={`text-[13px] tabular-nums ${isToday ? 'font-semibold text-[#4158D0]' : 'text-white/[0.92]'}`}>
                    {day.slice(5).replace('-', '/')}
                  </span>
                  <span className={`text-[11px] ${isToday ? 'text-[#4158D0]' : 'text-white/[0.40]'}`}>
                    {WEEKDAYS_SHORT[parseLocal(day).getDay()]}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 渠道行 */}
          {channels.map((ch) => (
            <div key={ch} className="grid items-stretch border-b border-white/[0.08] last:border-0" style={{ gridTemplateColumns: `180px repeat(${weekDays.length}, minmax(${colMinW}px,1fr))` }}>
              <div className="flex items-center gap-2 px-4 py-2">
                <span className="text-[13px] text-white/[0.92]">{ch}</span>
                <BrandBadge brand={brandOfChannel(ch)} />
              </div>
              {weekDays.map((day) => {
                const hasBlocks = unfilteredPersonsOf(day, ch).length > 0;
                const blocks = personsOf(day, ch);
                if (!hasBlocks) {
                  return (
                    <div key={day} className="flex min-h-[56px] items-center justify-center border-l border-dashed border-[#FF9F0A]/60 p-1.5">
                      <span className="text-[11px] text-[#FF9F0A]/70" />
                    </div>
                  );
                }
                return (
                  <div key={day} className="flex flex-col justify-center gap-1 border-l border-white/[0.08] p-1.5">
                    {blocks.length === 0 ? (
                      <div className="text-[11px] text-white/[0.40]">—</div>
                    ) : (
                      blocks.map((p) => (
                        <div key={p.name} className="group relative flex min-h-[34px] flex-col justify-center rounded-md bg-[#4158D0] px-2 py-1">
                          <div className="text-[12px] font-medium leading-tight text-white">{p.name}</div>
                          <div className="text-[10px] leading-tight text-white/85 tabular-nums">
                            {personRangeLabel(p.timeSlots) || '-'} · {p.totalHours}h
                          </div>
                          <HoverCard person={p} channel={ch} />
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===== 日视图（逐日卡片列表，可展开查看明细） =====
function DayView({ viewDates }: { viewDates: DateData[] }) {
  return (
    <div className="space-y-4">
      {viewDates.map((d) => {
        const active = d.accounts.filter((a) => a.personSummary.length > 0);
        if (active.length === 0) return null;
        const dayHours = active.reduce((s, a) => s + a.stats.totalHours, 0);
        const dayPerson = active.reduce((s, a) => s + a.stats.personCount, 0);
        const dayEarly = active.reduce((s, a) => s + a.stats.earlyMorningHours, 0);
        return (
          <DayCard
            key={d.date}
            date={d.date}
            dayHours={dayHours}
            dayPerson={dayPerson}
            dayEarly={dayEarly}
            accounts={active}
          />
        );
      })}
      {viewDates.length === 0 && <div className="py-10 text-center text-white/[0.40]">所选日期范围内暂无排班数据</div>}
    </div>
  );
}

function DayCard({
  date,
  dayHours,
  dayPerson,
  dayEarly,
  accounts,
}: {
  date: string;
  dayHours: number;
  dayPerson: number;
  dayEarly: number;
  accounts: AccountData[];
}) {
  const [open, setOpen] = useState(false);
  const dateObj = parseLocal(date);
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#1E2235]">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[16px] font-medium text-white/[0.92]">{dateObj.getMonth() + 1}月{dateObj.getDate()}日</span>
          <span className="text-[12px] text-white/[0.40]">{WEEKDAYS_SHORT[dateObj.getDay()]}</span>
        </div>
        {dayEarly > 0 && (
          <span className="rounded-full bg-[#FF9F0A]/15 px-2.5 py-0.5 text-[12px] text-[#FF9F0A]">🌙 凌晨班 {dayEarly}h</span>
        )}
      </div>
      <div className="px-4 py-3">
        <div className="text-[13px] tabular-nums text-white/[0.65]">{dayPerson}人次 · {dayHours}小时</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {accounts.map((acc) => (
            <span key={acc.accountName} className="inline-flex items-center gap-1 rounded-lg bg-[#2A2E45] px-2 py-0.5 text-[12px] text-white/[0.92]">
              {shortChannel(acc.accountName)} {acc.stats.personCount}
            </span>
          ))}
        </div>
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between border-t border-white/[0.08] px-4 text-[12px] text-white/[0.40] transition hover:text-white/[0.92]"
      >
        <span>{open ? '收起明细' : '查看排班明细'}</span>
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
      </button>
      {open && (
        <div className="border-t border-white/[0.08] px-4 py-3">
          {accounts.map((acc) => (
            <div key={acc.accountName} className="mb-3 last:mb-0">
              <div className="mb-1 flex items-center gap-2 text-[13px] text-white/[0.92]">
                <span className="font-medium">{shortChannel(acc.accountName)}</span>
                <BrandBadge brand={brandOfChannel(acc.accountName)} />
              </div>
              <div className="space-y-1">
                {acc.personSummary.map((p) => (
                  <div key={p.name} className="flex items-center gap-3 rounded-lg bg-[#151827] px-3 py-1.5 text-[12px]">
                    <span className="w-24 text-white/[0.92]">{p.name}</span>
                    <span className="text-white/[0.40]">{shortChannel(acc.accountName)}</span>
                    <span className="tabular-nums text-white/[0.65]">{p.totalHours}h</span>
                    <span className="ml-auto tabular-nums text-white/[0.40]">{personRangeLabel(p.timeSlots) || '-'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}