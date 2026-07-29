'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { BRANDS } from '@/lib/constants';

// ===== 类型定义 =====
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
  stats: { personCount: number; totalHours: number; earlyMorningHours: number; dualBroadcastHours: number };
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

// 渠道胶囊颜色配置
const CHANNEL_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  'vivo（大号）': { bg: 'rgba(65,88,208,0.15)', text: '#4158D0', bar: '#4158D0' },
  'vivo官方旗舰店（抖音）': { bg: 'rgba(65,88,208,0.1)', text: '#6B7FE8', bar: '#4158D0' },
  'vivo官方旗舰店（快手）': { bg: 'rgba(65,88,208,0.08)', text: '#8B9BF0', bar: '#4158D0' },
  'iQOO手机（快手）': { bg: 'rgba(123,97,255,0.15)', text: '#7B61FF', bar: '#7B61FF' },
  'iQOO手机（抖音）': { bg: 'rgba(123,97,255,0.12)', text: '#9B81FF', bar: '#7B61FF' },
  'iQOO官方旗舰店（抖音）': { bg: 'rgba(123,97,255,0.1)', text: '#B59FFF', bar: '#7B61FF' },
};

// 渠道简称映射
const CHANNEL_SHORT_NAMES: Record<string, string> = {
  'vivo（大号）': 'vivo大号',
  'vivo官方旗舰店（抖音）': '抖音',
  'vivo官方旗舰店（快手）': '快手',
  'iQOO手机（快手）': 'iQOO快手',
  'iQOO手机（抖音）': 'iQOO抖音',
  'iQOO官方旗舰店（抖音）': 'iQOO抖音',
};

// ===== 组件 =====
export default function SchedulePage() {
  const { getVisibleBrands } = useApp();
  // 品牌和角色状态
  const [brand, setBrand] = useState<'vivo' | 'iQOO'>('vivo');
  const [role, setRole] = useState<'anchor' | 'control'>('anchor');

  // 根据用户权限过滤可用品牌
  const availableBrands = useMemo(() => {
    const allowed = getVisibleBrands('schedule');
    const brandOptions: { id: 'vivo' | 'iQOO'; label: string }[] = [];
    if (allowed.includes('vivo')) brandOptions.push({ id: 'vivo', label: 'vivo' });
    if (allowed.includes('iqoo')) brandOptions.push({ id: 'iQOO', label: 'iQOO' });
    return brandOptions;
  }, [getVisibleBrands]);

  // 如果当前选中品牌不在可用列表中，自动切换到第一个可用品牌
  useEffect(() => {
    if (availableBrands.length > 0 && !availableBrands.find(b => b.id === brand)) {
      setBrand(availableBrands[0].id);
    }
  }, [availableBrands, brand]);

  // 日期区间
  const [startDate, setStartDate] = useState('2026-05-01');
  const [endDate, setEndDate] = useState('2026-05-07');
  const [mounted, setMounted] = useState(false);

  const [scheduleData, setScheduleData] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [selectedPerson, setSelectedPerson] = useState('全部');

  // 客户端挂载后设置今天日期
  useEffect(() => {
    setStartDate(getDaysAgo(6));
    setEndDate(getToday());
    setMounted(true);
  }, []);

  // 获取排班数据
  const fetchSchedule = useCallback(async (start: string, end: string, b: string, r: string) => {
    if (!start || !end) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/schedule?start=${start}&end=${end}&brand=${b}&role=${r}`);
      const json: ScheduleResponse = await res.json();
      if (json.success) {
        setScheduleData(json);
        // 初始化展开状态：含凌晨班的默认展开，其余默认收起
        const initialExpanded: Record<string, boolean> = {};
        json.data.dates.forEach((d: DateData) => {
          const totalEarly = d.accounts.reduce((s, a) => s + (a.stats?.earlyMorningHours || 0), 0);
          initialExpanded[d.date] = totalEarly > 0;
        });
        setExpandedDates(initialExpanded);
      } else {
        setError(json.data ? '数据格式错误' : '获取数据失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  // 日期、品牌或角色变化时自动获取
  useEffect(() => {
    if (mounted && startDate && endDate) {
      fetchSchedule(startDate, endDate, brand, role);
    }
  }, [startDate, endDate, mounted, brand, role, fetchSchedule]);

  const rawDates = scheduleData?.data?.dates || [];

  // 提取去重人员名单
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

  // 按选中人员筛选
  const dates = useMemo(() => {
    if (selectedPerson === '全部') return rawDates;
    return rawDates.map((d: { date: string; display?: string; accounts?: { accountName: string; personSummary?: { name: string; totalHours: number; earlyMorningHours: number; dualBroadcastHours: number; timeSlots: string[] }[]; stats?: { personCount: number; totalHours: number; earlyMorningHours: number; dualBroadcastHours: number } }[] }) => ({
      ...d,
      accounts: (d.accounts || []).map((a: { accountName: string; personSummary?: { name: string; totalHours: number; earlyMorningHours: number; dualBroadcastHours: number; timeSlots: string[] }[]; stats?: { personCount: number; totalHours: number; earlyMorningHours: number; dualBroadcastHours: number } }) => {
        const filtered = (a.personSummary || []).filter((p: { name: string }) => p.name === selectedPerson);
        const personCount = filtered.length;
        const totalHours = filtered.reduce((s: number, p: { totalHours: number }) => s + (p.totalHours || 0), 0);
        const earlyMorningHours = filtered.reduce((s: number, p: { earlyMorningHours: number }) => s + (p.earlyMorningHours || 0), 0);
        const dualBroadcastHours = filtered.reduce((s: number, p: { dualBroadcastHours: number }) => s + (p.dualBroadcastHours || 0), 0);
        return {
          ...a,
          personSummary: filtered,
          stats: { personCount, totalHours, earlyMorningHours, dualBroadcastHours },
        };
      }),
    }));
  }, [rawDates, selectedPerson]);

  // 根据筛选结果计算汇总
  const globalStats = useMemo(() => {
    if (selectedPerson === '全部' && scheduleData?.data?.globalStats) {
      return scheduleData.data.globalStats;
    }
    let totalDays = 0;
    let totalPersonDays = 0;
    let totalHours = 0;
    let totalEarlyMorning = 0;
    let totalDualBroadcast = 0;
    dates.forEach((d: { accounts?: { personSummary?: unknown[]; stats?: { personCount: number; totalHours: number; earlyMorningHours: number; dualBroadcastHours: number } }[] }) => {
      const hasPerson = (d.accounts || []).some((a: { personSummary?: unknown[] }) => (a.personSummary || []).length > 0);
      if (hasPerson) totalDays++;
      (d.accounts || []).forEach((a: { stats?: { personCount: number; totalHours: number; earlyMorningHours: number; dualBroadcastHours: number } }) => {
        totalPersonDays += (a.stats?.personCount || 0);
        totalHours += (a.stats?.totalHours || 0);
        totalEarlyMorning += (a.stats?.earlyMorningHours || 0);
        totalDualBroadcast += (a.stats?.dualBroadcastHours || 0);
      });
    });
    return { totalDays, totalPersonDays, totalHours, totalEarlyMorning, totalDualBroadcast };
  }, [dates, selectedPerson, scheduleData]);

  // 切换日期展开/收起
  const toggleDateExpanded = (dateStr: string) => {
    setExpandedDates(prev => ({
      ...prev,
      [dateStr]: !prev[dateStr],
    }));
  };

  // 角色显示名称
  const roleLabel = role === 'anchor' ? '主播' : '中控';

  if (!mounted) {
    return <div className="p-8 text-center text-zinc-500">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0B0F19] text-[#E5E7EB] p-6">
      {/* 标题行：标题 + 品牌Tab + 角色Toggle */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-2xl font-bold">主播排班管理</h1>
        
        <div className="flex items-center gap-4">
          {/* 品牌切换 Tab */}
          <div className="flex items-center bg-[#111827] rounded-lg p-1">
            {availableBrands.map((b) => (
              <button
                key={b.id}
                onClick={() => setBrand(b.id)}
                className={`px-4 py-1.5 text-sm rounded-md transition ${
                  brand === b.id
                    ? 'bg-[#4158D0] text-white'
                    : 'text-[#9CA3AF] hover:text-white'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* 角色切换 Toggle */}
          <div className="flex items-center bg-[#111827] rounded-lg p-1">
            <button
              onClick={() => setRole('anchor')}
              className={`px-4 py-1.5 text-sm rounded-md transition ${
                role === 'anchor'
                  ? 'bg-[#7B61FF] text-white'
                  : 'text-[#9CA3AF] hover:text-white'
              }`}
            >
              主播
            </button>
            <button
              onClick={() => setRole('control')}
              className={`px-4 py-1.5 text-sm rounded-md transition ${
                role === 'control'
                  ? 'bg-[#7B61FF] text-white'
                  : 'text-[#9CA3AF] hover:text-white'
              }`}
            >
              中控
            </button>
          </div>
        </div>
      </div>

      {/* ===== 日期区间选择器 ===== */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <span className="text-sm text-[#9CA3AF]">日期范围</span>
        <input
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          className="bg-[#111827] border border-[#1F2937] rounded-lg px-3 py-2 text-sm text-[#E5E7EB] focus:border-[#4158D0] focus:outline-none"
        />
        <span className="text-[#9CA3AF]">~</span>
        <input
          type="date"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          className="bg-[#111827] border border-[#1F2937] rounded-lg px-3 py-2 text-sm text-[#E5E7EB] focus:border-[#4158D0] focus:outline-none"
        />
        <button
          onClick={() => { setStartDate(getDaysAgo(6)); setEndDate(getToday()); }}
          className="px-3 py-2 text-xs rounded-lg bg-[#111827] border border-[#1F2937] text-zinc-300 hover:bg-zinc-700 transition"
        >近7天</button>
        <button
          onClick={() => {
            const d = new Date();
            const m = d.getMonth();
            const y = d.getFullYear();
            setStartDate(`${y}-${String(m + 1).padStart(2, '0')}-01`);
            setEndDate(getToday());
          }}
          className="px-3 py-2 text-xs rounded-lg bg-[#111827] border border-[#1F2937] text-zinc-300 hover:bg-zinc-700 transition"
        >本月</button>
        <button
          onClick={() => fetchSchedule(startDate, endDate, brand, role)}
          className="px-4 py-2 text-xs rounded-lg bg-[#4158D0] text-white hover:bg-[#5168E0] transition font-medium"
        >刷新</button>

        {/* 人员筛选 */}
        <div className="flex items-center gap-2 ml-4">
          <span className="text-sm text-[#9CA3AF]">{roleLabel}筛选</span>
          <select
            value={selectedPerson}
            onChange={e => setSelectedPerson(e.target.value)}
            className="bg-[#111827] border border-[#1F2937] rounded-lg px-3 py-2 text-sm text-[#E5E7EB] focus:border-[#4158D0] focus:outline-none min-w-[140px]"
          >
            <option value="全部">全部{roleLabel}</option>
            {allPersons.map((name: string) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ===== 全局汇总卡片 ===== */}
      {globalStats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <StatCard label="覆盖天数" value={globalStats.totalDays} suffix="天" color="#4facfe" />
          <StatCard label="排班人次" value={globalStats.totalPersonDays} suffix="人次" color="#66df7c" />
          <StatCard label="总时长" value={globalStats.totalHours} suffix="小时" color="#f093fb" />
          <StatCard label="常规时长" value={globalStats.totalHours - globalStats.totalEarlyMorning} suffix="小时" color="#4facfe" />
          <StatCard label="凌晨班时长" value={globalStats.totalEarlyMorning} suffix="小时" color="#ffb84d" />
          <StatCard label="双播时长" value={globalStats.totalDualBroadcast} suffix="小时" color="#c084fc" />
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
              isExpanded={expandedDates[dateItem.date] || false}
              onToggleExpand={() => toggleDateExpanded(dateItem.date)}
            />
          ))}
        </div>
      )}

      {!loading && !error && dates.length === 0 && scheduleData && (
        <div className="text-center py-10 text-zinc-500">所选日期范围内暂无排班数据</div>
      )}

      {/* ===== 页脚 ===== */}
      <div className="text-center mt-8 text-xs text-[#4B5563]">
        © 2026 Blue直播 · 排班管理系统
      </div>
    </div>
  );
}

// ===== 汇总卡片 =====
function StatCard({ label, value, suffix, color }: { label: string; value: number; suffix: string; color: string }) {
  return (
    <div className="bg-[#111827] rounded-xl p-4 border border-[#1F2937] hover:border-zinc-600/50 transition">
      <div className="flex items-center gap-1.5 text-xs text-[#9CA3AF] mb-1">
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-white">{value}</span>
        <span className="text-xs text-[#9CA3AF]">{suffix}</span>
      </div>
    </div>
  );
}

// ===== 日期分组（方案D设计） =====
function DateGroup({
  dateItem,
  isExpanded,
  onToggleExpand,
}: {
  dateItem: DateData;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const totalPersons = dateItem.accounts.reduce((s, a) => s + (a.stats?.personCount || 0), 0);
  const totalHours = dateItem.accounts.reduce((s, a) => s + (a.stats?.totalHours || 0), 0);
  const totalEarly = dateItem.accounts.reduce((s, a) => s + (a.stats?.earlyMorningHours || 0), 0);

  // 解析日期显示
  const dateObj = new Date(dateItem.date);
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekDay = weekDays[dateObj.getDay()];

  // 检查是否有超负荷（单人>10h或同日3+渠道）
  const hasOverload = dateItem.accounts.some(a => {
    const hasLongHours = (a.personSummary || []).some(p => (p.totalHours || 0) > 10);
    return hasLongHours;
  }) || dateItem.accounts.filter(a => (a.stats?.personCount || 0) > 0).length >= 3;

  return (
    <article className="bg-[#111827] rounded-xl border border-[#1F2937] overflow-hidden">
      {/* 标题行 */}
      <header className="px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-[#E5E7EB]">{month}月{day}日</span>
          <span className="text-sm text-[#9CA3AF]">{weekDay}</span>
        </div>
        {totalEarly > 0 && (
          <span className="flex items-center gap-1 px-3 py-1 rounded-2xl bg-[rgba(245,158,11,0.15)] text-[#F59E0B] text-sm">
            🌙 凌晨班 {totalEarly}h
          </span>
        )}
      </header>

      {/* 汇总统计行（可点击折叠/展开） */}
      <button
        onClick={onToggleExpand}
        className="w-full px-5 py-3 flex items-center justify-between border-t border-[#1F2937] hover:bg-white/[0.02] transition-colors"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-3 flex-wrap">
          {/* 当日统计 */}
          <span className="text-sm text-[#E5E7EB]">
            {totalPersons}人次 · {totalHours}小时
          </span>
          
          {/* 渠道胶囊标签 */}
          <div className="flex items-center gap-2 flex-wrap">
            {dateItem.accounts.map(account => {
              const colors = CHANNEL_COLORS[account.accountName] || { bg: 'rgba(100,100,100,0.15)', text: '#9CA3AF', bar: '#666' };
              const shortName = CHANNEL_SHORT_NAMES[account.accountName] || account.accountName;
              const personCount = account.stats?.personCount || 0;
              if (personCount === 0) return null;
              return (
                <span
                  key={account.accountName}
                  className="px-3 py-1 rounded-2xl text-sm"
                  style={{ background: colors.bg, color: colors.text }}
                >
                  {shortName} <span className="font-bold">{personCount}</span>
                </span>
              );
            })}
          </div>
        </div>

        {/* 折叠箭头 */}
        <span
          className={`text-[#9CA3AF] hover:text-[#E5E7EB] transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
          style={{ display: 'inline-block' }}
        >
          ▼
        </span>
      </button>

      {/* 展开后的渠道与个人详情 */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="px-5 pb-4 space-y-4 overflow-x-auto">
          <div className="min-w-[600px]">
          {dateItem.accounts.map(account => {
            const personCount = account.stats?.personCount || 0;
            if (personCount === 0) return null;
            
            const colors = CHANNEL_COLORS[account.accountName] || { bg: 'rgba(100,100,100,0.15)', text: '#9CA3AF', bar: '#666' };
            const shortName = CHANNEL_SHORT_NAMES[account.accountName] || account.accountName;
            const accountTotalHours = account.stats?.totalHours || 0;
            const accountEarlyHours = account.stats?.earlyMorningHours || 0;
            
            // 状态条颜色
            let statusBarColor = '#10B981'; // 绿色（正常）
            if (accountEarlyHours > 0) {
              statusBarColor = '#F59E0B'; // 橙黄（含凌晨班）
            }
            if (hasOverload) {
              statusBarColor = '#EF4444'; // 红色（超负荷）
            }

            return (
              <section key={account.accountName} className="relative">
                {/* 渠道标题行 */}
                <div className="flex items-center gap-3 mb-3">
                  {/* 左侧状态条 */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1 rounded-full"
                    style={{ background: statusBarColor }}
                  />
                  <div className="pl-4">
                    <span className="text-sm font-semibold text-[#E5E7EB]">{shortName}</span>
                    <span className="text-sm text-[#9CA3AF] ml-2">· {personCount}人 · {accountTotalHours}H</span>
                  </div>
                </div>

                {/* 个人排班行 */}
                <div className="pl-4 space-y-1">
                  {(account.personSummary || []).map(person => (
                    <PersonRow key={person.name} person={person} barColor={colors.bar} />
                  ))}
                </div>
              </section>
            );
          })}
          </div>
        </div>
      </div>
    </article>
  );
}

// ===== 个人排班行 =====
function PersonRow({ person, barColor }: { person: PersonSummary; barColor: string }) {
  const hasEarlyMorning = (person.earlyMorningHours || 0) > 0;
  
  // 计算时段条宽度比例（以24h为满宽）
  const barWidth = Math.min((person.totalHours / 24) * 100, 100);

  return (
    <div className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-white/[0.03] transition-colors group">
      {/* 姓名 */}
      <span className="text-sm text-[#E5E7EB] w-16 flex-shrink-0">{person.name}</span>
      
      {/* 时段色块条 */}
      <div className="flex-1 h-1.5 bg-[#1F2937] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ 
            width: `${barWidth}%`,
            background: hasEarlyMorning ? '#F59E0B' : barColor
          }}
        />
      </div>
      
      {/* 时段文字 */}
      <span className="text-xs text-[#9CA3AF] w-24 flex-shrink-0">
        {person.timeSlots.length > 0 ? formatTimeSlots(person.timeSlots) : ''}
      </span>
      
      {/* 时长 */}
      <span
        className="text-sm font-semibold w-10 text-right flex-shrink-0"
        style={{ color: hasEarlyMorning ? '#F59E0B' : '#E5E7EB' }}
      >
        {person.totalHours}h
      </span>
    </div>
  );
}

// 格式化时段显示
function formatTimeSlots(slots: string[]): string {
  if (slots.length === 0) return '';
  // 提取起始和结束时间
  const startSlot = slots[0];
  const endSlot = slots[slots.length - 1];
  
  // 解析时段格式（如 "8-9点"）
  const startMatch = startSlot.match(/(\d+)-/);
  const endMatch = endSlot.match(/-(\d+)/);
  
  if (startMatch && endMatch) {
    const startHour = parseInt(startMatch[1]);
    const endHour = parseInt(endMatch[1]);
    return `${String(startHour).padStart(2, '0')}:00-${String(endHour).padStart(2, '0')}:00`;
  }
  
  return slots.join(', ');
}
