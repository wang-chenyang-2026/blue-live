'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { BRANDS } from '@/lib/constants';
import { calcProfitRate } from '@/lib/store';

import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';


interface ProfitCardData {
  id: string;
  name: string;
  color: string;
  profitRate: number;
  revenue: number;
  totalCost: number;
  kpiDeducted: boolean;
  isSummary?: boolean;
  totalHours?: number;
  partTimeAnchor?: number;
  partTimeControl?: number;
}

interface BrandStats {
  totalHours: number;
  partTimeAnchor: number;
  partTimeControl: number;
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days + 1);
  return d.toISOString().split('T')[0];
}

function getMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function DashboardPage() {
  const { isClient } = useApp();
  const [currentMonth, setCurrentMonth] = useState<string>('');
  // 日期范围（默认当月1日~今天）
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [refreshTick, setRefreshTick] = useState<number>(0);
  const [brandStats, setBrandStats] = useState<Record<string, BrandStats>>({});
  const [costByBrand, setCostByBrand] = useState<Record<string, number>>({});
  const [costLoading, setCostLoading] = useState(true);
  const [costError, setCostError] = useState<string>('');

  useEffect(() => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setCurrentMonth(month);

    // 默认当月：从月初到今天
    setStartDate(getMonthStart());
    setEndDate(getToday());
  }, []);

  // 刷新按钮：重新加载 localStorage 数据
  const handleRefresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  const brandColors: Record<string, string> = {
    vivo: '#415FFF',
    iqoo: '#FF6B35',
    iot: '#00C9A7',
  };

  // 根据日期范围推导 month（利润率计算按月）
  const selectedMonth = useMemo(() => {
    return startDate ? startDate.slice(0, 7) : currentMonth;
  }, [startDate, currentMonth]);

  // 拉取品牌排班统计（总时长 + 兼职人数）
  useEffect(() => {
    if (!selectedMonth) return;
    let cancelled = false;
    fetch(`/api/brand-schedule-stats?month=${selectedMonth}`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data?.brands) {
          const map: Record<string, BrandStats> = {};
          Object.entries(res.data.brands as Record<string, BrandStats>).forEach(([k, v]) => {
            map[k.toLowerCase()] = v;
          });
          setBrandStats(map);
        }
      })
      .catch((err) => console.error('fetch brand stats failed', err));
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, refreshTick]);

  // 拉取各品牌成本（来自成本核算API/飞书数据）
  useEffect(() => {
    if (!selectedMonth) return;
    let cancelled = false;
    setCostLoading(true);
    setCostError('');
    fetch(`/api/cost-overview?month=${selectedMonth}&brand=all&t=${Date.now()}`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data?.byBrand) {
          const map: Record<string, number> = {};
          Object.entries(res.data.byBrand as Record<string, number>).forEach(([k, v]) => {
            map[k.toLowerCase()] = Number(v) || 0;
          });
          console.log('[dashboard] costByBrand loaded:', map);
          setCostByBrand(map);
        } else {
          console.warn('[dashboard] cost-overview response missing byBrand:', res);
          setCostError('数据格式异常');
        }
      })
      .catch((err) => {
        console.error('[dashboard] fetch cost overview failed', err);
        if (!cancelled) setCostError('接口调用失败');
      })
      .finally(() => {
        if (!cancelled) setCostLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, refreshTick]);

  // 构建利润卡片数据 - 所有品牌
  const profitCards: ProfitCardData[] = useMemo(() => {
    if (!selectedMonth) return [];

    const cards: ProfitCardData[] = [];

    BRANDS.forEach((brand) => {
      const localData = calcProfitRate(brand.id, selectedMonth);
      const stats = brandStats[brand.id.toLowerCase()];
      // 优先使用飞书 API 返回的品牌成本（若已加载），否则回退到 localStorage
      const apiCost = costByBrand[brand.id.toLowerCase()];
      const totalCost = apiCost !== undefined ? apiCost : localData.totalCost;
      const revenue = localData.revenue;
      const profitRate = revenue > 0 ? (revenue - totalCost) / revenue : 0;

      cards.push({
        id: brand.id,
        name: `${brand.name}汇总`,
        color: brandColors[brand.id] || '#888',
        revenue,
        totalCost,
        profitRate,
        kpiDeducted: localData.kpiDeducted,
        totalHours: stats?.totalHours ?? 0,
        partTimeAnchor: stats?.partTimeAnchor ?? 0,
        partTimeControl: stats?.partTimeControl ?? 0,
      });
    });

    return cards;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, refreshTick, brandStats, costByBrand]);

  if (!isClient || !currentMonth) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">首页概览</h1>
          <p className="text-sm text-muted-foreground mt-1">加载中...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 h-48 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const dateRangeLabel = startDate === endDate
    ? startDate
    : `${startDate} ~ ${endDate}`;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">首页概览</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {dateRangeLabel} 数据总览
        </p>
      </div>

      {/* 筛选器：完全参照排班管理页面样式 —— 左侧日期范围+快捷+刷新，右侧品牌按钮组 */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* 左侧：日期范围 + 近7天 + 本月 + 刷新 */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-zinc-400">日期范围</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
          />
          <span className="text-zinc-500">~</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={() => { setStartDate(getDaysAgo(6)); setEndDate(getToday()); }}
            className="px-3 py-2 text-xs rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition"
          >近7天</button>
          <button
            onClick={() => { setStartDate(getMonthStart()); setEndDate(getToday()); }}
            className="px-3 py-2 text-xs rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition"
          >本月</button>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition font-medium flex items-center gap-1.5"
          >
            <RefreshCw className="h-3 w-3" />
            刷新
          </button>
        </div>

        {/* 右侧：品牌按钮组已移除 */}
      </div>

      {/* 利润率卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {profitCards.map((card) => (
          <ProfitCard key={card.id} data={card} costLoading={costLoading} costError={costError} />
        ))}
      </div>

    </div>
  );
}

// 利润卡片组件
function ProfitCard({ data, costLoading, costError }: { data: ProfitCardData; costLoading?: boolean; costError?: string }) {
  const rate = (data.profitRate * 100).toFixed(1);
  const isPositive = data.profitRate >= 0;

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-5 transition-all hover:scale-[1.01]',
        !data.isSummary && 'border-l-2'
      )}
      style={!data.isSummary ? { borderLeftColor: data.color } : undefined}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className={cn('h-3 w-3 rounded-full', data.isSummary && 'h-2.5 w-2.5')}
            style={{ backgroundColor: data.color }}
          />
          <span className={cn('text-sm font-medium text-foreground', data.isSummary && 'font-semibold')}>
            {data.name}
          </span>
        </div>
        {data.kpiDeducted && (
          <span className="rounded bg-destructive/20 px-1.5 py-0.5 text-[10px] text-destructive">
            KPI扣减5%
          </span>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-muted-foreground">利润率</p>
            <p
              className={cn(
                'font-bold',
                data.isSummary ? 'text-3xl' : 'text-2xl',
                isPositive ? 'text-emerald-400' : 'text-destructive'
              )}
            >
              {rate}%
            </p>
          </div>
          {isPositive ? (
            <TrendingUp className="h-5 w-5 text-emerald-400" />
          ) : (
            <TrendingDown className="h-5 w-5 text-destructive" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-secondary p-2">
            <p className="text-muted-foreground">服务费收入</p>
            <p className="font-medium text-foreground">
              ¥{data.revenue.toLocaleString()}
            </p>
          </div>
          <div className="rounded-md bg-secondary p-2">
            <p className="text-muted-foreground">总成本</p>
            <p className="font-medium text-foreground">
              {costLoading ? (
                <span className="text-muted-foreground text-[11px]">加载中...</span>
              ) : costError ? (
                <span className="text-destructive text-[11px]">{costError}</span>
              ) : (
                `¥${data.totalCost.toLocaleString()}`
              )}
            </p>
          </div>
          <div className="rounded-md bg-secondary p-2">
            <p className="text-muted-foreground">总时长</p>
            <p className="font-medium text-foreground font-mono">
              {(data.totalHours ?? 0).toLocaleString()} h
            </p>
          </div>
          <div className="rounded-md bg-secondary p-2">
            <p className="text-muted-foreground">兼职人数（主播/中控）</p>
            <p className="font-medium text-foreground font-mono">
              {data.partTimeAnchor ?? 0} / {data.partTimeControl ?? 0}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
