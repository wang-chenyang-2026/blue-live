'use client';

import { useEffect, useState, useCallback, useMemo, memo } from 'react';
import dynamic from 'next/dynamic';
import { useApp } from '@/contexts/AppContext';
import { BRANDS, COST_CATEGORIES } from '@/lib/constants';

// 成本分类颜色配置（常量，避免每次渲染重建）
const COST_CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  '兼职主播成本': { bg: 'bg-pink-500/10', border: 'border-pink-500', text: 'text-pink-400', dot: 'bg-pink-500' },
  '兼职中控成本': { bg: 'bg-amber-500/10', border: 'border-amber-500', text: 'text-amber-400', dot: 'bg-amber-500' },
  '全职主播成本': { bg: 'bg-blue-500/10', border: 'border-blue-500', text: 'text-blue-400', dot: 'bg-blue-500' },
  '全职中控成本': { bg: 'bg-purple-500/10', border: 'border-purple-500', text: 'text-purple-400', dot: 'bg-purple-500' },
  '日常物料成本': { bg: 'bg-emerald-500/10', border: 'border-emerald-500', text: 'text-emerald-400', dot: 'bg-emerald-500' },
  '其它成本': { bg: 'bg-zinc-500/10', border: 'border-zinc-500', text: 'text-zinc-400', dot: 'bg-zinc-500' },
};
import {
  getCostList,
  addCostItem,
  updateCostItem,
  deleteCostItem,
  getRevenueList,
  addRevenueItem,
  deleteRevenueItem,
  getKPIList,
  addKPIItem,
  updateKPIItem,
  calcProfitRate,
  genId,
} from '@/lib/store';
import type { CostItem, RevenueItem, KPIItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Trash2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSafeMonth } from '@/lib/hooks';

// ===== 工具函数 =====
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// recharts 动态导入，禁用 SSR 以避免 window/document 访问导致 hydration 错误
const RechartsBarChart = dynamic(
  () => import('recharts').then((mod) => {
    const { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = mod;
    return function DynamicBarChart(props: React.ComponentProps<typeof BarChart> & { data: unknown[]; bars: { dataKey: string; fill: string; name: string }[] }) {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={props.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="name" stroke="rgba(255,255,255,0.5)" fontSize={12} />
            <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} />
            <Tooltip />
            <Legend />
            {props.bars.map((bar) => (
              <Bar key={bar.dataKey} dataKey={bar.dataKey} fill={bar.fill} name={bar.name} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    };
  }),
  { ssr: false, loading: () => <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">图表加载中...</div> }
);

const RechartsLineChart = dynamic(
  () => import('recharts').then((mod) => {
    const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = mod;
    return function DynamicLineChart(props: React.ComponentProps<typeof LineChart> & { data: unknown[]; lines: { dataKey: string; stroke: string; name: string }[] }) {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={props.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="name" stroke="rgba(255,255,255,0.5)" fontSize={12} />
            <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} />
            <Tooltip />
            <Legend />
            {props.lines.map((line) => (
              <Line key={line.dataKey} type="monotone" dataKey={line.dataKey} stroke={line.stroke} name={line.name} strokeWidth={2} dot={{ r: 3 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    };
  }),
  { ssr: false, loading: () => <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">图表加载中...</div> }
);

export default function CostPage() {
  const { currentBrand, isClient } = useApp();
  const safeMonth = useSafeMonth();
  const [costs, setCosts] = useState<CostItem[]>([]);
  const [revenues, setRevenues] = useState<RevenueItem[]>([]);
  const [kpis, setKpis] = useState<KPIItem[]>([]);

  // 日期范围状态（替代月份选择器）- 必须在 selectedMonth 之前声明
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // 月份从日期范围的开始日期直接推导（不再使用独立 state）
  const selectedMonth = useMemo(() => {
    if (!startDate) return '';
    return startDate.slice(0, 7); // "2026-07-01" → "2026-07"
  }, [startDate]);

  const [activeBrand, setActiveBrand] = useState<string>('vivo');

  // 飞书数据状态
  const [feishuData, setFeishuData] = useState<{
    month: string;
    brand: string;
    dimensions: {
      anchor: { total: number; details: Array<{ name: string; hours: number; rate: number; cost: number }> };
      control: { total: number; details: Array<{ name: string; hours: number; cost: number; mode: string }> };
      fulltime: { total: number; details: Array<{ name: string; base: number; subsidy: number; cost: number; role: string }> };
      purchase: { total: number; details: unknown[] };
    };
    totalCost: number;
    byBrand: { vivo: number; iQOO: number; IOT: number };
  } | null>(null);
  const [feishuLoading, setFeishuLoading] = useState(false);

  const loadData = useCallback(() => {
    setCosts(getCostList());
    setRevenues(getRevenueList());
    setKpis(getKPIList());
  }, []);

  useEffect(() => {
    // 使用 useSafeMonth hook 提供的安全月份值初始化日期范围
    if (safeMonth && !startDate) {
      const [y, m] = safeMonth.split('-').map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      const today = getToday();
      const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
      setStartDate(`${y}-${String(m).padStart(2, '0')}-01`);
      setEndDate(today > monthEnd ? monthEnd : today);
    }
    loadData();
  }, [loadData, safeMonth]);

  useEffect(() => {
    if (currentBrand !== 'all') setActiveBrand(currentBrand);
  }, [currentBrand]);

  // selectedMonth 已通过 useMemo 从 startDate 自动推导，无需额外 useEffect

  // 获取飞书数据
  const fetchFeishuData = useCallback(async (month: string, brand: string) => {
    if (!month) return;
    setFeishuLoading(true);
    try {
      const res = await fetch(`/api/cost-overview?month=${month}&brand=${brand}`);
      const data = await res.json();
      if (data.success) {
        setFeishuData(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch feishu data:', error);
    } finally {
      setFeishuLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedMonth) {
      fetchFeishuData(selectedMonth, activeBrand);
    }
  }, [selectedMonth, activeBrand, fetchFeishuData]);

  // 所有 Hooks 必须在条件返回之前声明，遵守 React Rules of Hooks
  const brandAccounts = useMemo(
    () => BRANDS.find((b) => b.id === activeBrand)?.accounts ?? [],
    [activeBrand],
  );

  // 当前品牌当月数据（useMemo 缓存 filter 结果）
  const brandCosts = useMemo(
    () => costs.filter((c) => (activeBrand === 'all' || c.brandId === activeBrand) && c.month === selectedMonth),
    [costs, activeBrand, selectedMonth],
  );
  const brandRevenues = useMemo(
    () => revenues.filter((r) => (activeBrand === 'all' || r.brandId === activeBrand) && r.month === selectedMonth),
    [revenues, activeBrand, selectedMonth],
  );
  const brandKPIs = useMemo(
    () => kpis.filter((k) => (activeBrand === 'all' || k.brandId === activeBrand) && k.month === selectedMonth),
    [kpis, activeBrand, selectedMonth],
  );

  // 利润率计算 - 使用飞书API数据作为成本来源
  // useMemo 缓存 profit 计算，避免每次渲染都重算
  const profitData = useMemo(() => {
    const localStorageProfit = activeBrand === 'all'
      ? BRANDS.reduce((acc, b) => {
          const brandData = calcProfitRate(b.id, selectedMonth);
          return {
            revenue: acc.revenue + brandData.revenue,
            totalCost: acc.totalCost + brandData.totalCost,
            profitRate: 0,
            costs: { ...acc.costs, ...brandData.costs },
            kpiDeducted: acc.kpiDeducted || brandData.kpiDeducted,
          };
        }, { revenue: 0, totalCost: 0, profitRate: 0, costs: {} as Record<string, number>, kpiDeducted: false })
      : calcProfitRate(activeBrand, selectedMonth);

    const feishuTotalCost = feishuData?.totalCost ?? 0;
    const effectiveCost = feishuData ? feishuTotalCost : localStorageProfit.totalCost;
    const effectiveRevenue = localStorageProfit.revenue;
    const effectiveProfitRate = effectiveRevenue > 0
      ? (effectiveRevenue - effectiveCost) / effectiveRevenue
      : 0;

    return {
      revenue: effectiveRevenue,
      totalCost: effectiveCost,
      profitRate: effectiveProfitRate,
      costs: localStorageProfit.costs,
      kpiDeducted: localStorageProfit.kpiDeducted,
    };
  }, [activeBrand, selectedMonth, feishuData]);

  // 从飞书API获取各维度成本（useMemo 缓存）
  const feishuAnchorCost = feishuData?.dimensions?.anchor?.total ?? 0;
  const feishuControlCost = feishuData?.dimensions?.control?.total ?? 0;
  const feishuFulltimeCost = feishuData?.dimensions?.fulltime?.total ?? 0;
  const feishuPurchaseCost = feishuData?.dimensions?.purchase?.total ?? 0;

  // 利润率看板数据 - 所有品牌当月（useMemo 缓存，避免每次渲染都重算）
  const allBrandProfit = useMemo(
    () =>
      BRANDS.map((b) => ({
        brand: b.name,
        ...calcProfitRate(b.id, selectedMonth),
      })),
    [selectedMonth],
  );

  // 月度对比数据（近6个月）- 使用 selectedMonth 作为锚点避免 new Date()
  const monthlyComparison = useMemo(() => {
    if (!selectedMonth) return [];
    return Array.from({ length: 6 }, (_, i) => {
      const [y, m] = selectedMonth.split('-').map(Number);
      const targetMonth = m - i;
      const adjustedYear = targetMonth <= 0 ? y - 1 : y;
      const adjustedMonth = targetMonth <= 0 ? targetMonth + 12 : targetMonth;
      const month = `${adjustedYear}-${String(adjustedMonth).padStart(2, '0')}`;
      const data = calcProfitRate(activeBrand, month);
      return {
        month: month.slice(5),
        利润率: Number((data.profitRate * 100).toFixed(1)),
        收入: data.revenue,
        成本: data.totalCost,
      };
    }).reverse();
  }, [selectedMonth, activeBrand]);

  const brandColors: Record<string, string> = {
    vivo: '#415FFF',
    iqoo: '#FF6B35',
    iot: '#00C9A7',
  };

  const isPositive = profitData.profitRate >= 0;
  const costRatio = profitData.revenue > 0 ? (profitData.totalCost / profitData.revenue * 100).toFixed(1) : '0';

  // 客户端数据未就绪时返回骨架屏（在 Hooks 之后执行，不违反 Rules of Hooks）
  if (!isClient || !selectedMonth || !startDate) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">成本核算</h1>
          <p className="text-sm text-muted-foreground mt-1">加载中...</p>
        </div>
        <div className="rounded-xl border border-border bg-card h-48 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">成本核算</h1>
          <p className="text-sm text-muted-foreground mt-1">六大成本项、收入计算、KPI扣减与利润率分析</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
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
            onClick={() => {
              setStartDate(getDaysAgo(6));
              setEndDate(getToday());
            }}
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
            onClick={() => {
              if (selectedMonth) {
                fetchFeishuData(selectedMonth, activeBrand);
                loadData();
              }
            }}
            className="px-4 py-2 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition font-medium"
          >刷新</button>
        </div>
      </div>

      {/* Brand tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveBrand('all')}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs transition-colors',
            activeBrand === 'all' ? 'font-medium' : 'text-muted-foreground hover:text-foreground'
          )}
          style={
            activeBrand === 'all'
              ? { backgroundColor: '#a1a1aa25', color: '#a1a1aa' }
              : undefined
          }
        >
          全部
        </button>
        {BRANDS.map((b) => (
          <button
            key={b.id}
            onClick={() => setActiveBrand(b.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs transition-colors',
              activeBrand === b.id ? 'font-medium' : 'text-muted-foreground hover:text-foreground'
            )}
            style={
              activeBrand === b.id
                ? { backgroundColor: brandColors[b.id] + '25', color: brandColors[b.id] }
                : undefined
            }
          >
            {b.name}
          </button>
        ))}
      </div>

      {/* 利润率总览卡 */}
      <div className={cn(
        'rounded-xl border border-border bg-card p-6',
        `brand-glow-${activeBrand}`
      )}>
        <div className="grid grid-cols-4 gap-6">
          <div>
            <p className="text-xs text-muted-foreground">利润率</p>
            <p className={cn('text-4xl font-bold mt-1', isPositive ? 'text-emerald-400' : 'text-destructive')}>
              {(profitData.profitRate * 100).toFixed(1)}%
            </p>
            <div className="flex items-center gap-1 mt-1">
              {isPositive ? (
                <TrendingUp className="h-3 w-3 text-emerald-400" />
              ) : (
                <TrendingDown className="h-3 w-3 text-destructive" />
              )}
              <span className={cn('text-xs', isPositive ? 'text-emerald-400' : 'text-destructive')}>
                {isPositive ? '盈利' : '亏损'}
              </span>
              {profitData.kpiDeducted && (
                <Badge variant="outline" className="text-[10px] h-4 ml-1 border-destructive text-destructive">
                  KPI扣减5%
                </Badge>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">品牌服务费收入</p>
            <p className="text-2xl font-bold mt-1 text-foreground">
              ¥{profitData.revenue.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {brandRevenues.length} 条记录
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">总成本</p>
            <p className="text-2xl font-bold mt-1 text-foreground">
              ¥{profitData.totalCost.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              成本占比 {costRatio}%
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">毛利</p>
            <p className={cn(
              'text-2xl font-bold mt-1',
              profitData.revenue - profitData.totalCost >= 0 ? 'text-emerald-400' : 'text-destructive'
            )}>
              ¥{(profitData.revenue - profitData.totalCost).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              利润率 = (收入-成本)/收入
            </p>
          </div>
        </div>
      </div>

      {/* Tabs for costs, revenues, KPIs */}
      <Tabs defaultValue="costs">
        <TabsList className="bg-secondary">
          <TabsTrigger value="costs" className="text-xs">成本明细</TabsTrigger>
          <TabsTrigger value="revenues" className="text-xs">收入明细</TabsTrigger>
          <TabsTrigger value="kpi" className="text-xs">KPI管理</TabsTrigger>
          <TabsTrigger value="dashboard" className="text-xs">利润率看板</TabsTrigger>
        </TabsList>

        {/* 成本明细 */}
        <TabsContent value="costs" className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground">成本明细</h3>
          </div>

          {/* 成本分类汇总 - 使用飞书API数据（React.memo优化） */}
          <div className="relative">
            {feishuLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 rounded-lg">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  加载中...
                </div>
              </div>
            )}
            <CostCategoryCards feishuData={feishuData} brandCosts={brandCosts} />
          </div>

          {/* 成本列表 - 优先显示飞书数据 */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left p-2.5 text-muted-foreground font-medium">类别</th>
                  <th className="text-left p-2.5 text-muted-foreground font-medium">姓名/项目</th>
                  <th className="text-right p-2.5 text-muted-foreground font-medium">金额</th>
                  <th className="text-left p-2.5 text-muted-foreground font-medium">备注</th>
                  <th className="text-right p-2.5 text-muted-foreground font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {feishuData ? (
                  // 显示飞书数据明细
                  (() => {
                    const feishuRows: Array<{ category: string; name: string; amount: number; remark: string; source: string }> = [];
                    // 兼职主播
                    feishuData.dimensions.anchor.details.forEach((d: { name: string; cost: number; remark?: string }) => {
                      feishuRows.push({ category: '兼职主播成本', name: d.name, amount: d.cost, remark: d.remark || '', source: 'feishu' });
                    });
                    // 兼职中控
                    feishuData.dimensions.control.details.forEach((d: { name: string; cost: number; remark?: string }) => {
                      feishuRows.push({ category: '兼职中控成本', name: d.name, amount: d.cost, remark: d.remark || '', source: 'feishu' });
                    });
                    // 全职员工（按role拆分）
                    feishuData.dimensions.fulltime.details.forEach((d: { name: string; cost: number; role: string; remark?: string }) => {
                      const category = d.role === '主播' ? '全职主播成本' : '全职中控成本';
                      feishuRows.push({ category, name: d.name, amount: d.cost, remark: d.remark || '', source: 'feishu' });
                    });
                    // 日常采买
                    (feishuData.dimensions.purchase.details as Array<{ name: string; cost: number; remark?: string }>).forEach((d) => {
                      feishuRows.push({ category: '日常物料成本', name: d.name, amount: d.cost, remark: d.remark || '', source: 'feishu' });
                    });
                    if (feishuRows.length === 0) {
                      return (
                        <tr>
                          <td colSpan={5} className="text-center py-6 text-muted-foreground">暂无飞书成本数据</td>
                        </tr>
                      );
                    }
                    return feishuRows.map((row, idx) => (
                      <tr key={`feishu-${idx}`} className="border-t border-border hover:bg-secondary/30">
                        <td className="p-2.5 text-foreground">{row.category}</td>
                        <td className="p-2.5 text-foreground">{row.name}</td>
                        <td className="p-2.5 text-right text-foreground font-medium">¥{row.amount.toLocaleString()}</td>
                        <td className="p-2.5 text-muted-foreground">{row.remark || '-'}</td>
                        <td className="p-2.5 text-right text-muted-foreground text-[10px]">飞书</td>
                      </tr>
                    ));
                  })()
                ) : (
                  // 显示localStorage数据
                  brandCosts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-muted-foreground">暂无成本数据</td>
                    </tr>
                  ) : (
                    brandCosts.map((c) => (
                      <tr key={c.id} className="border-t border-border hover:bg-secondary/30">
                        <td className="p-2.5 text-foreground">{c.category}</td>
                        <td className="p-2.5 text-foreground">-</td>
                        <td className="p-2.5 text-right text-foreground font-medium">¥{c.amount.toLocaleString()}</td>
                        <td className="p-2.5 text-muted-foreground">{c.remark || '-'}</td>
                        <td className="p-2.5 text-right">
                          <button
                            onClick={() => { deleteCostItem(c.id); loadData(); }}
                            className="text-destructive hover:text-destructive/80"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* 收入明细 */}
        <TabsContent value="revenues" className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground">收入明细</h3>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left p-2.5 text-muted-foreground font-medium">账号</th>
                  <th className="text-left p-2.5 text-muted-foreground font-medium">直播类型</th>
                  <th className="text-right p-2.5 text-muted-foreground font-medium">时长</th>
                  <th className="text-right p-2.5 text-muted-foreground font-medium">小时费</th>
                  <th className="text-right p-2.5 text-muted-foreground font-medium">收入</th>
                  <th className="text-right p-2.5 text-muted-foreground font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {brandRevenues.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-muted-foreground">暂无收入数据</td>
                  </tr>
                ) : (
                  brandRevenues.map((r) => {
                    const account = BRANDS.flatMap((b) => b.accounts).find((a) => a.id === r.accountId);
                    return (
                      <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                        <td className="p-2.5 text-foreground">{account?.name || '-'}</td>
                        <td className="p-2.5 text-foreground">{r.liveType}</td>
                        <td className="p-2.5 text-right text-foreground">{r.hours}h</td>
                        <td className="p-2.5 text-right text-foreground">¥{r.hourlyRate}</td>
                        <td className="p-2.5 text-right text-foreground font-medium">¥{r.revenue.toLocaleString()}</td>
                        <td className="p-2.5 text-right">
                          <button
                            onClick={() => { deleteRevenueItem(r.id); loadData(); }}
                            className="text-destructive hover:text-destructive/80"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* KPI管理 */}
        <TabsContent value="kpi" className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground">KPI管理</h3>
          </div>

          <div className="space-y-3">
            {brandKPIs.length === 0 ? (
              <div className="rounded-lg border border-border py-8 text-center text-xs text-muted-foreground">
                暂无KPI数据
              </div>
            ) : (
              brandKPIs.map((kpi) => {
                const account = BRANDS.flatMap((b) => b.accounts).find((a) => a.id === kpi.accountId);
                const metrics = [
                  { label: '曝光进入率(人数)', actual: kpi.metrics.exposureEnterRate, target: kpi.targetMetrics.exposureEnterRate, unit: '%' },
                  { label: '曝光进入率(次数)', actual: kpi.metrics.exposureEnterRateCount, target: kpi.targetMetrics.exposureEnterRateCount, unit: '%' },
                  { label: 'GPM', actual: kpi.metrics.gpm, target: kpi.targetMetrics.gpm, unit: '' },
                  { label: '停留时长', actual: kpi.metrics.avgStayDuration, target: kpi.targetMetrics.avgStayDuration, unit: 's' },
                  { label: '转粉率', actual: kpi.metrics.followRate, target: kpi.targetMetrics.followRate, unit: '%' },
                ];

                return (
                  <div key={kpi.id} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{account?.name}</span>
                        {kpi.isDeducted ? (
                          <Badge className="bg-destructive/20 text-destructive text-[10px]">
                            <XCircle className="h-3 w-3 mr-0.5" />KPI未达标 扣减5%
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">
                            <CheckCircle2 className="h-3 w-3 mr-0.5" />KPI达标
                          </Badge>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          const updated = { ...kpi, isDeducted: !kpi.isDeducted };
                          updateKPIItem(updated);
                          loadData();
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        切换达标状态
                      </button>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {metrics.map((m) => {
                        const passed = m.actual >= m.target;
                        return (
                          <div key={m.label} className="rounded-md bg-secondary p-2 text-center">
                            <p className="text-[10px] text-muted-foreground">{m.label}</p>
                            <p className={cn('text-sm font-bold', passed ? 'text-emerald-400' : 'text-destructive')}>
                              {m.actual}{m.unit}
                            </p>
                            <p className="text-[10px] text-muted-foreground">目标 {m.target}{m.unit}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* 利润率看板 */}
        <TabsContent value="dashboard" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 品牌利润率对比 */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-medium text-foreground mb-4">品牌利润率对比 ({selectedMonth})</h3>
              <RechartsBarChart
                data={allBrandProfit}
                bars={[{ dataKey: 'profitRate', fill: 'oklch(0.65 0.2 260)', name: '利润率' }]}
              />
            </div>

            {/* 月度趋势 */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-medium text-foreground mb-4">
                {BRANDS.find((b) => b.id === activeBrand)?.name} 月度利润率趋势
              </h3>
              <RechartsLineChart
                data={monthlyComparison}
                lines={[{ dataKey: '利润率', stroke: 'oklch(0.65 0.2 260)', name: '利润率' }]}
              />
            </div>
          </div>

          {/* 品牌利润率卡片 */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            {allBrandProfit.map((item) => {
              const brand = BRANDS.find((b) => b.name === item.brand)!;
              const rate = (item.profitRate * 100).toFixed(1);
              const positive = item.profitRate >= 0;
              return (
                <div key={brand.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: brandColors[brand.id] }} />
                    <span className="text-sm font-medium text-foreground">{brand.name}</span>
                  </div>
                  <p className={cn('text-2xl font-bold', positive ? 'text-emerald-400' : 'text-destructive')}>
                    {rate}%
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="rounded bg-secondary p-2">
                      <p className="text-muted-foreground">收入</p>
                      <p className="font-medium text-foreground">¥{item.revenue.toLocaleString()}</p>
                    </div>
                    <div className="rounded bg-secondary p-2">
                      <p className="text-muted-foreground">成本</p>
                      <p className="font-medium text-foreground">¥{item.totalCost.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const CostCategoryCards = memo(function CostCategoryCards({
  feishuData, brandCosts
}: {
  feishuData: any;
  brandCosts: any[];
}) {
  const CATEGORIES = [
    { id: 'anchor', name: '兼职主播', key: 'anchor', isDim: true },
    { id: 'control', name: '兼职中控', key: 'control', isDim: true },
    { id: 'fulltime-anchor', name: '全职主播', key: 'fulltime', role: '主播' },
    { id: 'fulltime-control', name: '全职中控', key: 'fulltime', role: '中控' },
    { id: 'purchase', name: '日常物料', key: 'purchase', isDim: true },
    { id: 'other', name: '其它', key: 'other' },
  ];
  return (
    <div className="grid grid-cols-3 gap-4">
      {CATEGORIES.map((cat) => {
        const colors = COST_CATEGORY_COLORS[cat.id] || { dot: 'bg-gray-400', border: 'border-gray-700', bg: 'bg-gray-900/20' };
        let feishuCatCost = 0;
        let feishuCatCount = 0;
        if (feishuData && feishuData.dimensions) {
          if (cat.isDim) {
            feishuCatCost = feishuData.dimensions[cat.key]?.total || 0;
            feishuCatCount = feishuData.dimensions[cat.key]?.details?.length || 0;
          } else if (cat.role) {
            const details = feishuData.dimensions[cat.key]?.details || [];
            feishuCatCost = details.filter((d: any) => d.role === cat.role).reduce((s: number, d: any) => s + d.cost, 0);
            feishuCatCount = details.filter((d: any) => d.role === cat.role).length;
          }
        }
        const localCost = (brandCosts || []).filter((c: any) => c.category === cat.id).reduce((s: number, c: any) => s + (c.amount || c.cost || 0), 0);
        const displayCost = feishuCatCost > 0 ? feishuCatCost : localCost;
        return (
          <div key={cat.id} className={`rounded-xl border ${colors.border} ${colors.bg} bg-card p-4 transition-all hover:scale-[1.01]`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
              <span className="text-sm font-medium text-muted-foreground">{cat.name}</span>
            </div>
            <div className="text-2xl font-bold text-foreground">¥{displayCost.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {feishuCatCount > 0 ? `${feishuCatCount}人` : `${(brandCosts || []).filter((c: any) => c.category === cat.id).length}项`}
            </div>
          </div>
        );
      })}
    </div>
  );
});

