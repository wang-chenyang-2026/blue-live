'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useApp } from '@/contexts/AppContext';
import { BRANDS, HOURLY_RATES, LIVE_TYPES, COST_CATEGORIES } from '@/lib/constants';
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
import type { CostItem, RevenueItem, KPIItem, LiveType, CostCategory } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Database,
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
  // 月份初始值用空字符串，在 useEffect 中用客户端实际月份填充
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [activeBrand, setActiveBrand] = useState<string>('vivo');
  const [showCostDialog, setShowCostDialog] = useState(false);
  const [showRevenueDialog, setShowRevenueDialog] = useState(false);
  const [showKPIDialog, setShowKPIDialog] = useState(false);

  // 日期范围状态（替代月份选择器）
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

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
  const [feishuBrand, setFeishuBrand] = useState<string>('all');

  const [newCost, setNewCost] = useState({
    category: '兼职主播成本' as CostCategory,
    amount: 0,
    remark: '',
  });
  const [newRevenue, setNewRevenue] = useState({
    accountId: '',
    liveType: '日常直播' as LiveType,
    hours: 0,
    remark: '',
  });
  const [newKPI, setNewKPI] = useState({
    accountId: '',
    exposureEnterRate: 0,
    exposureEnterRateCount: 0,
    gpm: 0,
    avgStayDuration: 0,
    followRate: 0,
    targetExposureEnterRate: 0,
    targetExposureEnterRateCount: 0,
    targetGpm: 0,
    targetAvgStayDuration: 0,
    targetFollowRate: 0,
  });

  const loadData = useCallback(() => {
    setCosts(getCostList());
    setRevenues(getRevenueList());
    setKpis(getKPIList());
  }, []);

  useEffect(() => {
    // 使用 useSafeMonth hook 提供的安全月份值
    if (safeMonth) {
      setSelectedMonth(safeMonth);
      // 初始化日期范围为本月1日~今天
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

  // 日期范围的起始日期变化时，自动推导月份并触发数据刷新
  useEffect(() => {
    if (startDate) {
      const derivedMonth = startDate.slice(0, 7);
      setSelectedMonth(derivedMonth);
    }
  }, [startDate]);

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
      fetchFeishuData(selectedMonth, feishuBrand);
    }
  }, [selectedMonth, feishuBrand, fetchFeishuData]);

  // 客户端数据未就绪时返回骨架屏，确保 SSR/CSR 结构一致
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

  const brandAccounts = BRANDS.find((b) => b.id === activeBrand)?.accounts ?? [];

  // 当前品牌当月数据
  const brandCosts = costs.filter((c) => c.brandId === activeBrand && c.month === selectedMonth);
  const brandRevenues = revenues.filter((r) => r.brandId === activeBrand && r.month === selectedMonth);
  const brandKPIs = kpis.filter((k) => k.brandId === activeBrand && k.month === selectedMonth);

  // 利润率计算
  const profitData = calcProfitRate(activeBrand, selectedMonth);

  // 利润率看板数据 - 所有品牌当月
  const allBrandProfit = BRANDS.map((b) => ({
    brand: b.name,
    ...calcProfitRate(b.id, selectedMonth),
  }));

  // 月度对比数据（近6个月）- 使用 selectedMonth 作为锚点避免 new Date()
  const monthlyComparison = Array.from({ length: 6 }, (_, i) => {
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

  // 添加成本
  function handleAddCost() {
    const item: CostItem = {
      id: genId(),
      brandId: activeBrand,
      month: selectedMonth,
      category: newCost.category,
      amount: newCost.amount,
      remark: newCost.remark,
    };
    addCostItem(item);
    loadData();
    setShowCostDialog(false);
    setNewCost({ category: '兼职主播成本', amount: 0, remark: '' });
  }

  // 添加收入
  function handleAddRevenue() {
    const rate = HOURLY_RATES[newRevenue.liveType];
    const item: RevenueItem = {
      id: genId(),
      brandId: activeBrand,
      month: selectedMonth,
      accountId: newRevenue.accountId,
      liveType: newRevenue.liveType,
      hours: newRevenue.hours,
      hourlyRate: rate,
      revenue: newRevenue.hours * rate,
      remark: newRevenue.remark,
    };
    addRevenueItem(item);
    loadData();
    setShowRevenueDialog(false);
    setNewRevenue({ accountId: '', liveType: '日常直播', hours: 0, remark: '' });
  }

  // 添加KPI
  function handleAddKPI() {
    // 检查是否达标
    const isDeducted =
      newKPI.exposureEnterRate < newKPI.targetExposureEnterRate ||
      newKPI.exposureEnterRateCount < newKPI.targetExposureEnterRateCount ||
      newKPI.gpm < newKPI.targetGpm ||
      newKPI.avgStayDuration < newKPI.targetAvgStayDuration ||
      newKPI.followRate < newKPI.targetFollowRate;

    const item: KPIItem = {
      id: genId(),
      brandId: activeBrand,
      month: selectedMonth,
      accountId: newKPI.accountId,
      metrics: {
        exposureEnterRate: newKPI.exposureEnterRate,
        exposureEnterRateCount: newKPI.exposureEnterRateCount,
        gpm: newKPI.gpm,
        avgStayDuration: newKPI.avgStayDuration,
        followRate: newKPI.followRate,
      },
      targetMetrics: {
        exposureEnterRate: newKPI.targetExposureEnterRate,
        exposureEnterRateCount: newKPI.targetExposureEnterRateCount,
        gpm: newKPI.targetGpm,
        avgStayDuration: newKPI.targetAvgStayDuration,
        followRate: newKPI.targetFollowRate,
      },
      isDeducted,
    };
    addKPIItem(item);
    loadData();
    setShowKPIDialog(false);
  }

  const brandColors: Record<string, string> = {
    vivo: '#415FFF',
    iqoo: '#FF6B35',
    iot: '#00C9A7',
  };

  const isPositive = profitData.profitRate >= 0;
  const costRatio = profitData.revenue > 0 ? (profitData.totalCost / profitData.revenue * 100).toFixed(1) : '0';

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
              // 强制重新获取当前月份数据
              if (startDate) {
                const month = startDate.slice(0, 7);
                setSelectedMonth('');
                setTimeout(() => setSelectedMonth(month), 0);
              }
            }}
            className="px-4 py-2 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition font-medium"
          >刷新</button>
        </div>
      </div>

      {/* Brand tabs */}
      <div className="flex items-center gap-2">
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
          <TabsTrigger value="feishu" className="text-xs">飞书数据</TabsTrigger>
        </TabsList>

        {/* 成本明细 */}
        <TabsContent value="costs" className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground">成本明细</h3>
            <Dialog open={showCostDialog} onOpenChange={setShowCostDialog}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" />添加成本</Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader><DialogTitle>添加成本项</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">成本类别</Label>
                    <Select value={newCost.category} onValueChange={(v) => setNewCost({ ...newCost, category: v as CostCategory })}>
                      <SelectTrigger className="bg-secondary border-border mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {COST_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">金额（元）</Label>
                    <Input
                      type="number"
                      value={newCost.amount || ''}
                      onChange={(e) => setNewCost({ ...newCost, amount: Number(e.target.value) })}
                      placeholder="输入金额"
                      className="bg-secondary border-border mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">备注</Label>
                    <Input
                      value={newCost.remark}
                      onChange={(e) => setNewCost({ ...newCost, remark: e.target.value })}
                      placeholder="可选备注"
                      className="bg-secondary border-border mt-1"
                    />
                  </div>
                  <Button onClick={handleAddCost} className="w-full" disabled={newCost.amount <= 0}>
                    确认添加
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* 成本分类汇总 */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
            {COST_CATEGORIES.map((cat) => {
              const total = brandCosts.filter((c) => c.category === cat).reduce((s, c) => s + c.amount, 0);
              return (
                <div key={cat} className="rounded-lg bg-secondary p-3 text-center">
                  <p className="text-sm font-bold text-foreground">¥{total.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{cat.replace('成本', '')}</p>
                </div>
              );
            })}
          </div>

          {/* 成本列表 */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left p-2.5 text-muted-foreground font-medium">类别</th>
                  <th className="text-right p-2.5 text-muted-foreground font-medium">金额</th>
                  <th className="text-left p-2.5 text-muted-foreground font-medium">备注</th>
                  <th className="text-right p-2.5 text-muted-foreground font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {brandCosts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-6 text-muted-foreground">暂无成本数据</td>
                  </tr>
                ) : (
                  brandCosts.map((c) => (
                    <tr key={c.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="p-2.5 text-foreground">{c.category}</td>
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
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* 收入明细 */}
        <TabsContent value="revenues" className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground">收入明细</h3>
            <Dialog open={showRevenueDialog} onOpenChange={setShowRevenueDialog}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" />添加收入</Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader><DialogTitle>添加收入项</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">账号</Label>
                    <Select value={newRevenue.accountId} onValueChange={(v) => setNewRevenue({ ...newRevenue, accountId: v })}>
                      <SelectTrigger className="bg-secondary border-border mt-1">
                        <SelectValue placeholder="选择账号" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {brandAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">直播类型</Label>
                      <Select value={newRevenue.liveType} onValueChange={(v) => setNewRevenue({ ...newRevenue, liveType: v as LiveType })}>
                        <SelectTrigger className="bg-secondary border-border mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border">
                          {LIVE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t} (¥{HOURLY_RATES[t]}/h)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">时长（小时）</Label>
                      <Input
                        type="number"
                        value={newRevenue.hours || ''}
                        onChange={(e) => setNewRevenue({ ...newRevenue, hours: Number(e.target.value) })}
                        placeholder="0"
                        className="bg-secondary border-border mt-1"
                      />
                    </div>
                  </div>
                  <div className="rounded-md bg-secondary p-3 text-xs">
                    <p className="text-muted-foreground">
                      小时费率：¥{HOURLY_RATES[newRevenue.liveType]}/小时
                    </p>
                    <p className="font-medium text-foreground mt-1">
                      预计收入：¥{(newRevenue.hours * HOURLY_RATES[newRevenue.liveType]).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">备注</Label>
                    <Input
                      value={newRevenue.remark}
                      onChange={(e) => setNewRevenue({ ...newRevenue, remark: e.target.value })}
                      placeholder="可选备注"
                      className="bg-secondary border-border mt-1"
                    />
                  </div>
                  <Button onClick={handleAddRevenue} className="w-full" disabled={!newRevenue.accountId || newRevenue.hours <= 0}>
                    确认添加
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
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
            <Dialog open={showKPIDialog} onOpenChange={setShowKPIDialog}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" />添加KPI</Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border max-w-lg">
                <DialogHeader><DialogTitle>添加KPI指标</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2 max-h-[60vh] overflow-y-auto">
                  <div>
                    <Label className="text-xs text-muted-foreground">账号</Label>
                    <Select value={newKPI.accountId} onValueChange={(v) => setNewKPI({ ...newKPI, accountId: v })}>
                      <SelectTrigger className="bg-secondary border-border mt-1">
                        <SelectValue placeholder="选择账号" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {brandAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">实际值 / 目标值</p>
                  {[
                    { key: 'exposureEnterRate', label: '曝光进入率（人数）', unit: '%' },
                    { key: 'exposureEnterRateCount', label: '曝光进入率（次数）', unit: '%' },
                    { key: 'gpm', label: 'GPM', unit: '' },
                    { key: 'avgStayDuration', label: '停留时长', unit: '秒' },
                    { key: 'followRate', label: '转粉率', unit: '%' },
                  ].map(({ key, label, unit }) => (
                    <div key={key} className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">实际{label}</Label>
                        <Input
                          type="number"
                          value={(newKPI as unknown as Record<string, number>)[key] || ''}
                          onChange={(e) => setNewKPI({ ...newKPI, [key]: Number(e.target.value) })}
                          placeholder="实际值"
                          className="bg-secondary border-border mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">目标{label}</Label>
                        <Input
                          type="number"
                          value={(newKPI as unknown as Record<string, number>)[`target${key.charAt(0).toUpperCase()}${key.slice(1)}`] || ''}
                          onChange={(e) => {
                            const targetKey = `target${key.charAt(0).toUpperCase()}${key.slice(1)}`;
                            setNewKPI({ ...newKPI, [targetKey]: Number(e.target.value) });
                          }}
                          placeholder="目标值"
                          className="bg-secondary border-border mt-1"
                        />
                      </div>
                    </div>
                  ))}
                  <Button onClick={handleAddKPI} className="w-full" disabled={!newKPI.accountId}>
                    确认添加
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
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

        {/* 飞书数据 */}
        <TabsContent value="feishu" className="mt-4">
          <FeishuDataPanel externalMonth={selectedMonth} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// 飞书数据面板组件
function FeishuDataPanel({ externalMonth }: { externalMonth: string }) {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [brand, setBrand] = useState('all');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // 初始化日期范围（从外部月份推导）
  useEffect(() => {
    if (externalMonth) {
      setStartDate(`${externalMonth}-01`);
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      setEndDate(todayStr);
    }
  }, [externalMonth]);

  // 数据请求：直接使用 externalMonth，消除内部 month 状态
  useEffect(() => {
    if (!externalMonth) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/cost-overview?month=${externalMonth}&brand=${brand}`)
      .then(res => res.json())
      .then(json => {
        if (cancelled) return;
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error || '获取数据失败');
        }
      })
      .catch(() => {
        if (!cancelled) setError('网络请求失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [externalMonth, brand, refreshKey]);

  const formatMoney = (n: number) => `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4">
      {/* 日期区间选择器 */}
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
            const mo = d.getMonth();
            const y = d.getFullYear();
            setStartDate(`${y}-${String(mo + 1).padStart(2, '0')}-01`);
            setEndDate(getToday());
          }}
          className="px-3 py-2 text-xs rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition"
        >本月</button>
        <div className="flex items-center gap-2 ml-2">
          <Label className="text-xs text-zinc-400">品牌</Label>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger className="w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="vivo">vivo</SelectItem>
              <SelectItem value="iQOO">iQOO</SelectItem>
              <SelectItem value="IOT">IOT</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="px-4 py-2 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition font-medium"
        >刷新</button>
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-3 text-sm text-muted-foreground">正在从飞书获取数据...</span>
        </div>
      )}

      {/* 错误状态 */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* 数据展示 */}
      {data && !loading && (
        <>
          {/* 四维度卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-pink-500/30 bg-pink-500/10 p-4">
              <p className="text-xs text-pink-400">兼职主播</p>
              <p className="text-2xl font-bold text-pink-300 mt-1">{formatMoney(data.dimensions.anchor.total)}</p>
              <p className="text-xs text-muted-foreground mt-1">{data.dimensions.anchor.details.length} 人</p>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-xs text-amber-400">兼职中控</p>
              <p className="text-2xl font-bold text-amber-300 mt-1">{formatMoney(data.dimensions.control.total)}</p>
              <p className="text-xs text-muted-foreground mt-1">{data.dimensions.control.details.length} 人</p>
            </div>
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
              <p className="text-xs text-blue-400">全职员工</p>
              <p className="text-2xl font-bold text-blue-300 mt-1">{formatMoney(data.dimensions.fulltime.total)}</p>
              <p className="text-xs text-muted-foreground mt-1">{data.dimensions.fulltime.details.length} 人</p>
            </div>
            <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4">
              <p className="text-xs text-green-400">日常采买</p>
              <p className="text-2xl font-bold text-green-300 mt-1">{formatMoney(data.dimensions.purchase.total)}</p>
              <p className="text-xs text-muted-foreground mt-1">{data.dimensions.purchase.details.length} 条</p>
            </div>
          </div>

          {/* 总成本 */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">总成本</h3>
              <p className="text-2xl font-bold text-primary">{formatMoney(data.totalCost)}</p>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">vivo</p>
                <p className="text-sm font-medium text-foreground">{formatMoney(data.byBrand.vivo)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">iQOO</p>
                <p className="text-sm font-medium text-foreground">{formatMoney(data.byBrand.iQOO)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">IOT</p>
                <p className="text-sm font-medium text-foreground">{formatMoney(data.byBrand.IOT)}</p>
              </div>
            </div>
          </div>

          {/* 兼职主播明细 */}
          {data.dimensions.anchor.details.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-medium text-foreground mb-3">兼职主播明细</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2">姓名</th>
                    <th className="text-right py-2">时长(h)</th>
                    <th className="text-right py-2">时薪</th>
                    <th className="text-right py-2">成本</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dimensions.anchor.details.map((item: any, idx: number) => (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="py-2">{item.name}</td>
                      <td className="text-right py-2">{item.hours}</td>
                      <td className="text-right py-2">{formatMoney(item.rate)}</td>
                      <td className="text-right py-2 font-medium">{formatMoney(item.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 兼职中控明细 */}
          {data.dimensions.control.details.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-medium text-foreground mb-3">兼职中控明细</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2">姓名</th>
                    <th className="text-right py-2">时长(h)</th>
                    <th className="text-left py-2">模式</th>
                    <th className="text-right py-2">成本</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dimensions.control.details.map((item: any, idx: number) => (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="py-2">{item.name}</td>
                      <td className="text-right py-2">{item.hours}</td>
                      <td className="py-2"><Badge variant="outline" className="text-xs">{item.mode}</Badge></td>
                      <td className="text-right py-2 font-medium">{formatMoney(item.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 全职员工明细 */}
          {data.dimensions.fulltime.details.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-medium text-foreground mb-3">全职员工明细</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2">姓名</th>
                    <th className="text-left py-2">角色</th>
                    <th className="text-right py-2">底薪</th>
                    <th className="text-right py-2">补贴</th>
                    <th className="text-right py-2">成本</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dimensions.fulltime.details.map((item: any, idx: number) => (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="py-2">{item.name}</td>
                      <td className="py-2"><Badge variant="outline" className="text-xs">{item.role}</Badge></td>
                      <td className="text-right py-2">{formatMoney(item.base)}</td>
                      <td className="text-right py-2">{formatMoney(item.subsidy)}</td>
                      <td className="text-right py-2 font-medium">{formatMoney(item.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 空状态 */}
          {data.dimensions.anchor.details.length === 0 && 
           data.dimensions.control.details.length === 0 && 
           data.dimensions.fulltime.details.length === 0 && 
           data.dimensions.purchase.details.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Database className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm">该月份暂无数据</p>
              <p className="text-xs mt-1">请检查排班表是否已录入该月数据</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
