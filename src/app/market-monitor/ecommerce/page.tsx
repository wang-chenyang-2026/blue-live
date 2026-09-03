'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Tag,
  Building2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
} from 'recharts';

/* ========== Types ========== */
interface EcommerceView {
  key: string;
  label: string;
  message: string;
}

interface FilterState {
  industry: string;
  category: string;
  subcategory: string;
  brand: string;
  monthFrom: string; // YYYYMM，'' 表示不限
  monthTo: string;   // YYYYMM，'' 表示不限
}

// Radix Select 不接受空字符串作为 Item 值，用哨兵值表示"不限/全部"
const ALL_MONTH = '__all__';
const monthOptLabel = (yyyymm: number | string): string => {
  const v = String(yyyymm);
  return v.length === 6 ? `${v.slice(0, 4)}年${parseInt(v.slice(4, 6), 10)}月` : v;
};

function staticMonthWindow(): number[] {
  const now = new Date();
  const latest = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const months: number[] = [];
  for (let i = 12; i >= 0; i--) {
    const d = new Date(latest.getFullYear(), latest.getMonth() - i, 1);
    months.push(d.getFullYear() * 100 + (d.getMonth() + 1));
  }
  return months;
}

// Radix Select does not accept empty-string as an <Item value>, so we use a
// sentinel value in the UI and convert it to '' when calling MCP.
const ALL_SUBCATEGORY = '__all__';
const subcategoryForApi = (v: string) => (v === ALL_SUBCATEGORY || !v ? '' : v);

interface KpiCard {
  label: string;
  value: string;
  change: number;
  icon: React.ReactNode;
  color: string;
}

type CategoryTree = Record<string, Record<string, string[]>>;

const VIEWS: EcommerceView[] = [
  { key: '大盘趋势', label: '大盘趋势', message: '查看大盘趋势数据' },
  { key: '品牌排行', label: '品牌排行', message: '查看品牌销售排行' },
  { key: '销售价量', label: '销售价量', message: '查看销售价量数据' },
  { key: '店铺列表', label: '店铺列表', message: '查看店铺列表' },
  { key: '商品列表', label: '商品列表', message: '查看商品列表' },
  { key: '价格区间', label: '价格区间', message: '查看价格区间分析' },
  { key: '价格交叉', label: '价格交叉', message: '查看价格交叉分析' },
  { key: '热词频次', label: '热词频次', message: '查看热词频次数据' },
];

/**
 * 久谦 crawler 固定返回过去第 2~14 个月（共 13 个月，月度粒度，最新月滞后约 2 个月）。
 * 时间筛选为「开始年月 ~ 结束年月」区间，在前端对已返回的 13 个月数据切片。
 */
function monthBounds(from?: string, to?: string): [number, number] {
  const lo = Math.min(from ? Number(from) : 0, to ? Number(to) : 999999);
  const hi = Math.max(from ? Number(from) : 0, to ? Number(to) : 999999);
  return [lo || 0, hi || 999999];
}

/** Filter raw MCP records (with numeric 日期 field YYYYMM) to the selected month range. */
function filterRawByMonthRange(raw: any[], from?: string, to?: string): any[] {
  if (!Array.isArray(raw) || raw.length === 0 || (!from && !to)) return raw;
  const [lo, hi] = monthBounds(from, to);
  return raw.filter((r) => {
    const m = Number(r['日期']);
    return !m || (m >= lo && m <= hi);
  });
}

/** Filter normalized view data (with date field YYYYMM) by month range. Only for date-based views. */
function filterViewByMonthRange(data: any[], from?: string, to?: string): any[] {
  if (!Array.isArray(data) || data.length === 0 || (!from && !to)) return data;
  const hasDate = data.some((d) => d.date && /^\d{6}$/.test(String(d.date)));
  if (!hasDate) return data;
  const [lo, hi] = monthBounds(from, to);
  return data.filter((d) => {
    const m = Number(d.date);
    return !m || (m >= lo && m <= hi);
  });
}

/* ========== 图表配色（真实数据视图使用） ========== */
const CHART_COLORS = ['#4158D0', '#FF6B35', '#FF4D4F', '#FAAD14', '#52C41A', '#1890FF', '#722ED1', '#13C2C2'];

/* ========== KPI Calculation ========== */
/**
 * 基于大盘趋势原始数据计算 KPI，按月份区间过滤
 */
function buildKpiFromTrend(raw: any[], realBrandCount: number, monthFrom?: string, monthTo?: string, brand?: string): KpiCard[] {
  // First apply brand filter if a specific brand is selected and data has brand fields
  let brandFiltered = raw;
  if (brand && brand !== '全部品牌' && Array.isArray(raw)) {
    const withBrand = raw.filter((r) => r['品牌']);
    // Only apply brand filter if data actually contains per-brand records;
    // aggregate views have empty 品牌 field and should not be filtered
    if (withBrand.length > 0) {
      brandFiltered = raw.filter((r) => r['品牌'] === brand);
    }
  }
  const filtered = filterRawByMonthRange(brandFiltered, monthFrom, monthTo);
  if (!Array.isArray(filtered) || filtered.length === 0) {
    return [
      { label: '总销售额', value: '—', change: 0, icon: <DollarSign className="h-5 w-5" />, color: '#4158D0' },
      { label: '总销量', value: '—', change: 0, icon: <Package className="h-5 w-5" />, color: '#C850C0' },
      { label: '平均价格', value: '—', change: 0, icon: <Tag className="h-5 w-5" />, color: '#10B981' },
      { label: '品牌数', value: realBrandCount > 0 ? `${realBrandCount}个` : '—', change: 0, icon: <Building2 className="h-5 w-5" />, color: '#F59E0B' },
    ];
  }

  const byMonth = new Map<number, { sales: number; volume: number }>();
  for (const r of filtered) {
    const m = Number(r['日期']);
    if (!m) continue;
    const cur = byMonth.get(m) || { sales: 0, volume: 0 };
    cur.sales += Number(r['销售额(元)']) || 0;
    cur.volume += Number(r['销量(件)']) || 0;
    byMonth.set(m, cur);
  }
  const months = [...byMonth.keys()].sort((a, b) => a - b);

  let totalSales = 0;
  let totalVolume = 0;
  for (const m of months) {
    totalSales += byMonth.get(m)!.sales;
    totalVolume += byMonth.get(m)!.volume;
  }
  const avgPrice = totalVolume > 0 ? totalSales / totalVolume : 0;

  // 环比始终基于未做月份切片的完整 13 个月序列：最新自然月 vs 上一自然月。
  // 否则区间只选 1 个月时窗口内找不到上一月，会错误兜底为 0。
  const byMonthAll = new Map<number, { sales: number; volume: number }>();
  for (const r of (Array.isArray(brandFiltered) ? brandFiltered : [])) {
    const m = Number(r['日期']);
    if (!m) continue;
    const cur = byMonthAll.get(m) || { sales: 0, volume: 0 };
    cur.sales += Number(r['销售额(元)']) || 0;
    cur.volume += Number(r['销量(件)']) || 0;
    byMonthAll.set(m, cur);
  }
  const monthsAll = [...byMonthAll.keys()].sort((a, b) => a - b);

  const now = new Date();
  const curMonth = now.getFullYear() * 100 + (now.getMonth() + 1);
  let lastMonthIdx = monthsAll.length - 1;
  if (monthsAll[lastMonthIdx] === curMonth) lastMonthIdx -= 1;
  const prevMonthIdx = lastMonthIdx - 1;

  let salesMom = 0;
  let volumeMom = 0;
  let priceMom = 0;
  if (lastMonthIdx >= 1 && prevMonthIdx >= 0) {
    const cur = byMonthAll.get(monthsAll[lastMonthIdx])!;
    const prev = byMonthAll.get(monthsAll[prevMonthIdx])!;
    salesMom = prev.sales > 0 ? +(((cur.sales - prev.sales) / prev.sales) * 100).toFixed(1) : 0;
    volumeMom = prev.volume > 0 ? +(((cur.volume - prev.volume) / prev.volume) * 100).toFixed(1) : 0;
    const curPrice = cur.volume > 0 ? cur.sales / cur.volume : 0;
    const prevPrice = prev.volume > 0 ? prev.sales / prev.volume : 0;
    priceMom = prevPrice > 0 ? +(((curPrice - prevPrice) / prevPrice) * 100).toFixed(1) : 0;
  }

  const formatSales = (v: number) => (v >= 1e8 ? `¥${(v / 1e8).toFixed(2)}亿` : `¥${(v / 1e4).toFixed(1)}万`);
  const formatVolume = (v: number) => (v >= 1e4 ? `${(v / 1e4).toFixed(1)}万件` : `${v}件`);

  return [
    { label: '总销售额', value: formatSales(totalSales), change: salesMom, icon: <DollarSign className="h-5 w-5" />, color: '#4158D0' },
    { label: '总销量', value: formatVolume(totalVolume), change: volumeMom, icon: <Package className="h-5 w-5" />, color: '#C850C0' },
    { label: '平均价格', value: `¥${Math.round(avgPrice).toLocaleString()}`, change: priceMom, icon: <Tag className="h-5 w-5" />, color: '#10B981' },
    { label: '品牌数', value: realBrandCount > 0 ? `${realBrandCount}个` : '—', change: 0, icon: <Building2 className="h-5 w-5" />, color: '#F59E0B' },
  ];
}

function formatMonthLabel(yyyymm: number | string): string {
  const s = String(yyyymm);
  if (s.length !== 6) return s;
  return `${parseInt(s.slice(4, 6), 10)}月`;
}

/** 表格内展示销售额：元 → 万 / 亿 */
function formatSalesShort(v: number): string {
  const n = Number(v) || 0;
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  return n.toLocaleString();
}

/** 表格内展示销量：件 → 万件 */
function formatVolumeShort(v: number): string {
  const n = Number(v) || 0;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  return n.toLocaleString();
}

/* ========== KPI Card Component ========== */
function KpiCardComp({ label, value, change, icon, color }: KpiCard) {
  const isUp = change >= 0;
  return (
    <Card className="bg-card border-border overflow-hidden relative">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <div className={cn(
              'flex items-center gap-1 text-xs font-medium',
              isUp ? 'text-emerald-400' : 'text-red-400',
            )}>
              {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {isUp ? '+' : ''}{change.toFixed(1)}%
              <span className="text-muted-foreground ml-1">环比</span>
            </div>
          </div>
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {icon}
          </div>
        </div>
      </CardContent>
      <div
        className="absolute bottom-0 left-0 right-0 h-0.5"
        style={{ background: `linear-gradient(to right, ${color}, ${color}40)` }}
      />
    </Card>
  );
}

/* ========== View Components ========== */
// Platform metadata for channel split
// 配色在深色背景下需高饱和、高对比、彼此可区分：
// 京东-红、天猫-橙、抖音-品牌霓虹青
const PLATFORM_META: Record<string, { label: string; color: string }> = {
  jd: { label: '京东', color: '#FF3B30' },
  tmall: { label: '天猫', color: '#FF9500' },
  douyin: { label: '抖音', color: '#25F4EE' },
};

function TrendView({ loading, data }: { loading: boolean; data: any[] }) {
  // Check if data has platform field for channel split
  const hasPlatformData = useMemo(() => {
    return data?.some((r) => r.platform && r.platform !== '-' && PLATFORM_META[r.platform]) ?? false;
  }, [data]);

  const chartConfig = useMemo((): Record<string, { label: string; color: string }> => {
    if (hasPlatformData) {
      return {
        jd: { label: '京东(亿)', color: PLATFORM_META.jd.color },
        tmall: { label: '天猫(亿)', color: PLATFORM_META.tmall.color },
        douyin: { label: '抖音(亿)', color: PLATFORM_META.douyin.color },
      };
    }
    return {
      sales: { label: '销售额(万)', color: '#4158D0' },
      volume: { label: '销量(万件)', color: '#C850C0' },
    };
  }, [hasPlatformData]);

  // Chart data: by platform if available, otherwise aggregated
  const chartData = useMemo(() => {
    if (hasPlatformData) {
      // Group by month and platform, convert to 亿
      const map = new Map<number, { jd: number; tmall: number; douyin: number }>();
      for (const r of data || []) {
        const m = Number(r.date);
        if (!m) continue;
        const cur = map.get(m) || { jd: 0, tmall: 0, douyin: 0 };
        const platform = r.platform?.toLowerCase();
        const sales = (Number(r.sales) || 0) / 1e8; // Convert to 亿
        if (platform === 'jd') cur.jd += sales;
        else if (platform === 'tmall') cur.tmall += sales;
        else if (platform === 'douyin') cur.douyin += sales;
        map.set(m, cur);
      }
      return [...map.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([m, v]) => ({
          month: m,
          label: formatMonthLabel(m),
          jd: +v.jd.toFixed(2),
          tmall: +v.tmall.toFixed(2),
          douyin: +v.douyin.toFixed(2),
        }));
    }
    // Fallback: aggregated data
    const map = new Map<number, { sales: number; volume: number }>();
    for (const r of data || []) {
      const m = Number(r.date);
      if (!m) continue;
      const cur = map.get(m) || { sales: 0, volume: 0 };
      cur.sales += Number(r.sales) || 0;
      cur.volume += Number(r.volume) || 0;
      map.set(m, cur);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([m, v]) => ({
        month: m,
        label: formatMonthLabel(m),
        sales: +(v.sales / 1e4).toFixed(1),
        volume: +(v.volume / 1e4).toFixed(2),
      }));
  }, [data, hasPlatformData]);

  if (loading) {
    return (
      <div className="h-[400px] flex items-center justify-center">
        <Skeleton className="h-[350px] w-full rounded-lg" />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="h-[400px] flex items-center justify-center text-sm text-muted-foreground">
        当前筛选条件下暂无趋势数据
      </div>
    );
  }

  return (
    <div className="h-[400px] w-full">
      <ChartContainer config={chartConfig} className="!aspect-auto h-full w-full">
        {hasPlatformData ? (
          <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} label={{ value: '亿元', angle: -90, position: 'insideLeft', fontSize: 12 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="jd" name="京东" fill={PLATFORM_META.jd.color} stackId="stack" radius={[0, 0, 0, 0]} />
            <Bar dataKey="tmall" name="天猫" fill={PLATFORM_META.tmall.color} stackId="stack" />
            <Bar dataKey="douyin" name="抖音" fill={PLATFORM_META.douyin.color} stackId="stack" radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : (
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4158D0" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#4158D0" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#C850C0" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#C850C0" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              type="monotone"
              dataKey="sales"
              name="销售额(万)"
              stroke="#4158D0"
              fill="url(#salesGradient)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="volume"
              name="销量(万件)"
              stroke="#C850C0"
              fill="url(#volumeGradient)"
              strokeWidth={2}
            />
          </AreaChart>
        )}
      </ChartContainer>
    </div>
  );
}

function BrandRankingView({ loading, data }: { loading: boolean; data: any[] }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    );
  }

  const maxSales = Math.max(...data.map((d) => d.sales));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-3">
        {data.map((brand) => (
          <div key={brand.name} className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold',
                brand.rank <= 3
                  ? 'bg-gradient-to-br from-[#4158D0] to-[#C850C0] text-white'
                  : 'bg-secondary text-muted-foreground',
              )}
            >
              {brand.rank}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-foreground">{brand.name}</span>
                <span className="text-sm font-mono text-foreground">
                  {(brand.sales / 10000).toLocaleString(undefined, { maximumFractionDigits: 1 })}万
                </span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(brand.sales / maxSales) * 100}%`,
                    backgroundColor: brand.color,
                  }}
                />
              </div>
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span>占比 {brand.share}%</span>
                <span>均价 ¥{brand.avgPrice.toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="h-[350px]">
        <ChartContainer
          config={data.reduce((acc: Record<string, any>, d) => {
            acc[d.name] = { label: d.name, color: d.color };
            return acc;
          }, {})}
          className="h-full"
        >
          <PieChart>
            <Pie
              data={data}
              dataKey="sales"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
          </PieChart>
        </ChartContainer>
      </div>
    </div>
  );
}

function PriceVolumeView({ loading, data, xKey = 'range' }: { loading: boolean; data: any[]; xKey?: 'range' | 'label' }) {
  const chartConfig = {
    sales: { label: '销售额(万)', color: '#4158D0' },
    volume: { label: '销量(万件)', color: '#C850C0' },
  };

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    // 价格区间：数据本身带 range
    if (xKey === 'range' && data[0]?.range) {
      return data.map((d) => ({
        range: d.range,
        sales: +((Number(d.sales) || 0) / 1e4).toFixed(1),
        volume: +((Number(d.volume) || 0) / 1e4).toFixed(2),
      }));
    }
    // 销售价量：按月聚合
    const map = new Map<number, { sales: number; volume: number }>();
    for (const r of data) {
      const m = Number(r.date);
      if (!m) continue;
      const cur = map.get(m) || { sales: 0, volume: 0 };
      cur.sales += Number(r.sales) || 0;
      cur.volume += Number(r.volume) || 0;
      map.set(m, cur);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([m, v]) => ({
        label: formatMonthLabel(m),
        sales: +(v.sales / 1e4).toFixed(1),
        volume: +(v.volume / 1e4).toFixed(2),
      }));
  }, [data, xKey]);

  if (loading) {
    return <Skeleton className="h-[400px] w-full rounded-lg" />;
  }

  if (chartData.length === 0) {
    return (
      <div className="h-[400px] flex items-center justify-center text-sm text-muted-foreground">
        当前筛选条件下暂无数据
      </div>
    );
  }

  return (
    <div className="h-[400px]">
      <ChartContainer config={chartConfig} className="h-full">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey={xKey} stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="sales" name="销售额(万)" fill="#4158D0" radius={[4, 4, 0, 0]} />
          <Bar dataKey="volume" name="销量(万件)" fill="#C850C0" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

function DataTableView({
  loading,
  data,
  columns,
}: {
  loading: boolean;
  data: any[];
  columns: { key: string; label: string; align?: 'left' | 'right' }[];
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(col.align === 'right' && 'text-right')}
              >
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i}>
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  className={cn(
                    col.align === 'right' && 'text-right font-mono tabular-nums',
                    col.align !== 'right' && 'max-w-[320px] truncate',
                  )}
                  title={
                    col.align !== 'right' && row[col.key] != null
                      ? String(row[col.key])
                      : undefined
                  }
                >
                  {row[col.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function HotwordsView({ loading, data }: { loading: boolean; data: any[] }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
        当前筛选条件下暂无热词数据
      </div>
    );
  }

  // 按频次排序取 top 24
  const sorted = [...data].sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));
  const topWords = sorted.slice(0, 24);
  const maxCount = Math.max(...topWords.map((d) => Number(d.count) || 0), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {topWords.map((item, i) => {
          const c = Number(item.count) || 0;
          const ratio = c / maxCount;
          const size = 14 + ratio * 18;
          return (
            <Card
              key={`${item.word}-${i}`}
              className="bg-card border-border hover:border-primary/30 transition-colors"
            >
              <CardContent className="p-4 text-center">
                <div
                  className="font-bold mb-1 truncate"
                  style={{
                    fontSize: `${size}px`,
                    background: 'linear-gradient(to right, #4158D0, #C850C0)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                  title={item.word}
                >
                  {item.word}
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.toLocaleString()} 次
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DataTableView
        loading={false}
        data={sorted.slice(0, 50).map((d, i) => ({
          rank: i + 1,
          word: d.word,
          count: (Number(d.count) || 0).toLocaleString(),
        }))}
        columns={[
          { key: 'rank', label: '排名' },
          { key: 'word', label: '热词' },
          { key: 'count', label: '搜索频次', align: 'right' },
        ]}
      />
    </div>
  );
}

function PriceCrossView({ loading, data }: { loading: boolean; data: any[] }) {
  // 价格交叉原始字段示例：
  // { 品牌, 品牌占比(%), <1849, "1849- 3379", " 3379- 5658", "> 5658", ... }
  // 动态发现四个价格段字段（值为销售额）
  const segmentDefs = useMemo(() => {
    if (!data || data.length === 0) return [] as { key: string; label: string; color: string }[];
    const sample = data[0];
    const candidate = [
      { match: /^\s*<\s*1849/, label: '<1849', color: '#4158D0' },
      { match: /1849[\s\-]*3379/, label: '1849-3379', color: '#C850C0' },
      { match: /3379[\s\-]*5658/, label: '3379-5658', color: '#FF9A3C' },
      { match: />\s*5658/, label: '>5658', color: '#10B981' },
    ];
    const keys = Object.keys(sample);
    return candidate
      .map((c) => {
        const k = keys.find((kk) => c.match.test(kk) && !/占比|市占率/.test(kk));
        return k ? { key: k, label: c.label, color: c.color } : null;
      })
      .filter(Boolean) as { key: string; label: string; color: string }[];
  }, [data]);

  const chartData = useMemo(() => {
    if (!data || segmentDefs.length === 0) return [];
    const enriched = data.map((row) => {
      let total = 0;
      const segs: Record<string, number> = {};
      for (const s of segmentDefs) {
        const v = Number(row[s.key]) || 0;
        segs[s.key] = +(v / 1e4).toFixed(1); // 万元
        total += v;
      }
      return { brand: row['品牌'] || '-', total, segs };
    });
    return enriched
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((r) => ({ brand: r.brand, ...r.segs }));
  }, [data, segmentDefs]);

  if (loading) return <Skeleton className="h-[400px] w-full rounded-lg" />;

  if (chartData.length === 0) {
    return (
      <div className="h-[400px] flex items-center justify-center text-sm text-muted-foreground">
        当前筛选条件下暂无价格交叉数据
      </div>
    );
  }

  return (
    <div className="h-[440px]">
      <ChartContainer
        config={segmentDefs.reduce((acc: Record<string, any>, s) => {
          acc[s.key] = { label: s.label, color: s.color };
          return acc;
        }, {})}
        className="h-full"
      >
        <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <YAxis
            type="category"
            dataKey="brand"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            width={110}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {segmentDefs.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="a"
              fill={s.color}
            />
          ))}
        </BarChart>
      </ChartContainer>
      <p className="text-center text-[11px] text-muted-foreground mt-2">
        单位：万元 · 按品牌总销售额排序取 Top 10 · 色块代表不同价格段销售额
      </p>
    </div>
  );
}

/* ========== Main Component ========== */
export default function EcommercePage() {
  const [activeView, setActiveView] = useState('大盘趋势');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewData, setViewData] = useState<any[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [categoryTree, setCategoryTree] = useState<CategoryTree>({});
  const [treeLoading, setTreeLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    industry: '',
    category: '',
    subcategory: ALL_SUBCATEGORY,
    brand: '',
    monthFrom: '',
    monthTo: '',
  });
  const [realBrands, setRealBrands] = useState<string[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  // 大盘趋势原始数据（用于 KPI 计算，单位：元/件）——只在品类/品牌变化时拉取，切tab不重新拉
  const [trendRaw, setTrendRaw] = useState<any[]>([]);
  const [brandListRaw, setBrandListRaw] = useState<any[]>([]);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // AbortController ref for cancelling stale requests
  const trendAbortRef = useRef<AbortController | null>(null);
  const viewAbortRef = useRef<AbortController | null>(null);
  // Tracks whether data has ever been loaded; controls skeleton vs keep-old-data
  const hasDataRef = useRef(false);
  // Monotonic request token: incremented on every new trend fetch. Only the response
  // matching the latest token is allowed to update state, preventing stale responses
  // from a slow MCP queue from overwriting newer data (race condition fix).
  const trendReqToken = useRef(0);
  const viewReqToken = useRef(0);
  // Track previous category path to detect category-level changes vs brand-only changes
  const prevCategoryKey = useRef('');
  // Debounce filter changes to avoid flooding MCP when user rapidly switches filters
  const [debouncedFilters, setDebouncedFilters] = useState(filters);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedFilters(filters);
    }, 250);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [filters]);

  /* ---------- 1. Load category tree on mount ---------- */
  useEffect(() => {
    let cancelled = false;
    async function loadTree() {
      try {
        const res = await fetch('/api/market-monitor/categories');
        const json = await res.json();
        if (!cancelled && json.success && json.data) {
          const tree = json.data as CategoryTree;
          setCategoryTree(tree);
          const industries = Object.keys(tree);
          const firstIndustry = industries[0] || '';
          const firstCategory = firstIndustry && tree[firstIndustry]
            ? Object.keys(tree[firstIndustry])[0] || ''
            : '';
          const firstSubcategory = ALL_SUBCATEGORY;  // Default to "全部"
          const firstBrand = '全部品牌';
          setFilters({
            industry: firstIndustry,
            category: firstCategory,
            subcategory: firstSubcategory,
            brand: firstBrand,
            monthFrom: '',
            monthTo: '',
          });
        }
      } catch (err) {
        console.error('Failed to load category tree:', err);
      } finally {
        if (!cancelled) setTreeLoading(false);
      }
    }
    loadTree();
    return () => { cancelled = true; };
  }, []);

  /* ---------- 2. Derived data ---------- */
  const industries = useMemo(() => Object.keys(categoryTree), [categoryTree]);

  const categories = useMemo(() => {
    if (!filters.industry || !categoryTree[filters.industry]) return [];
    return Object.keys(categoryTree[filters.industry]);
  }, [filters.industry, categoryTree]);

  const subCategories = useMemo(() => {
    if (!filters.industry || !filters.category || !categoryTree[filters.industry]?.[filters.category]) return [];
    return categoryTree[filters.industry][filters.category];
  }, [filters.industry, filters.category, categoryTree]);

  const brands = useMemo(() => {
    return ['全部品牌', ...realBrands];
  }, [realBrands]);

  /* ---------- 2b. 数据中实际可用的月份（YYYYMM 升序），来自大盘趋势数据 ---------- */
  const availableMonths = useMemo(() => {
    const set = new Set<number>(staticMonthWindow());
    for (const r of trendRaw as any[]) {
      const m = Number(r['日期']);
      if (m >= 200000 && m <= 210012) set.add(m);
    }
    return [...set].sort((a, b) => a - b);
  }, [trendRaw]);

  /* ---------- 3. KPI cards（基于大盘趋势真实数据计算，按月份区间过滤） ---------- */
  const kpiCards: KpiCard[] = useMemo(
    () => {
      // When a specific brand is selected, use brandListRaw for KPI (has brand field)
      // Otherwise use trendRaw (aggregate data)
      const isSpecificBrand = debouncedFilters.brand && debouncedFilters.brand !== '全部品牌';
      const kpiSource = isSpecificBrand && brandListRaw.length > 0 ? brandListRaw : trendRaw;
      const from = availableMonths.includes(Number(debouncedFilters.monthFrom)) ? debouncedFilters.monthFrom : '';
      const to = availableMonths.includes(Number(debouncedFilters.monthTo)) ? debouncedFilters.monthTo : '';
      return buildKpiFromTrend(kpiSource, realBrands.length, from, to, debouncedFilters.brand);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trendRaw, brandListRaw, realBrands.length, debouncedFilters.monthFrom, debouncedFilters.monthTo, debouncedFilters.brand, availableMonths],
  );

  /* ---------- 3b. normalizeViewData: map Chinese field names to English ---------- */
  function normalizeViewData(viewKey: string, raw: any[]): any[] {
    if (!raw || raw.length === 0) return [];

    switch (viewKey) {
      case '品牌排行':
        return raw.map((item, i) => ({
          date: String(item['日期'] || ''),
          rank: i + 1,
          name: item['品牌'] || '-',
          sales: Number(item['销售额(元)']) || 0,
          share: item['销售额占比(%)'] ?? 0,
          avgPrice: Number(item['均价(元)']) || 0,
          volume: Number(item['销量(件)']) || 0,
          yoy: item['销售额同比(%)'] ?? '-',
          color: CHART_COLORS[i % CHART_COLORS.length],
        }));

      case '大盘趋势':
        return raw.map((item) => ({
          date: String(item['日期'] || ''),
          platform: item['平台'] || '-',
          sales: Number(item['销售额(元)']) || 0,
          volume: Number(item['销量(件)']) || 0,
          avgPrice: Number(item['均价(元)']) || 0,
          salesYoy: item['销售额同比(%)'] ?? '-',
          volumeYoy: item['销量同比(%)'] ?? '-',
        }));

      case '销售价量':
        return raw.map((item) => ({
          date: String(item['日期'] || ''),
          platform: item['平台'] || '-',
          sales: Number(item['销售额(元)']) || 0,
          volume: Number(item['销量(件)']) || 0,
          avgPrice: Number(item['均价(元)']) || 0,
        }));

      case '店铺列表':
        return raw.map((item, i) => ({
          id: i + 1,
          name: item['店铺名称'] || item['店铺'] || '-',
          platform: item['平台'] || '-',
          sales: Number(item['销售额(元)']) || 0,
          volume: Number(item['销量(件)']) || 0,
          avgPrice: Number(item['均价(元)']) || 0,
        }));

      case '商品列表':
        return raw.map((item, i) => ({
          id: i + 1,
          name: item['商品名'] || item['商品名称'] || item['商品'] || '-',
          brand: item['品牌'] || '-',
          price: Number(item['均价(元)']) || Number(item['价格']) || 0,
          sales: Number(item['销售额(元)']) || 0,
          volume: Number(item['销量(件)']) || 0,
        }));

      case '价格区间':
      case '价格交叉':
        return raw.map((item) => ({
          ...item,
          range: item['价格区间'] || item['价格带'] || '-',
          sales: Number(item['销售额(元)']) || 0,
          volume: Number(item['销量(件)']) || 0,
        }));

      case '热词频次':
        return raw.map((item) => ({
          word: item['热词'] || item['关键词'] || item['词汇'] || '-',
          count: Number(item['频次'] || item['出现次数']) || 0,
        }));

      default:
        return raw;
    }
  }

  /* ---------- 4. fetchCrawlerView: 统一调用 crawler MCP ---------- */
  const fetchCrawlerView = useCallback(
    async (
      categoryView: string,
      categoryList: string[],
      brand: string,
      signal?: AbortSignal,
    ): Promise<any[] | null> => {
      try {
        const timeoutSignal = AbortSignal.timeout(120000);
        const combinedSignal = signal
          ? AbortSignal.any([signal, timeoutSignal])
          : timeoutSignal;
        const res = await fetch('/api/market-monitor/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `查看数据`,
            category: categoryList,
            brand: brand === '全部品牌' ? '' : brand,
            view: categoryView,
          }),
          signal: combinedSignal,
        });
        const json = await res.json();
        if (json?.success && Array.isArray(json?.data?.data)) {
          return json.data.data as any[];
        }
        return null;
      } catch (err: any) {
        if (err?.name === 'AbortError') return null;
        console.error('[ecommerce] fetchCrawlerView error:', err);
        return null;
      }
    },
    [],
  );

  /* ---------- 5a. Fetch trend data (for KPI) — only when category/brand changes, NOT on tab switch ---------- */
  useEffect(() => {
    if (!debouncedFilters.industry || !debouncedFilters.category) return;

    const controller = new AbortController();
    trendAbortRef.current = controller;

    // category_list must have exactly 3 elements per MCP spec
    const categoryList = [
      debouncedFilters.industry,
      debouncedFilters.category,
      subcategoryForApi(debouncedFilters.subcategory),
    ];
    const brand = debouncedFilters.brand === '全部品牌' ? '' : debouncedFilters.brand;
    const categoryKey = categoryList.join('>');

    // Determine if this is a category-level change (vs brand-only or refresh)
    const isCategoryChange = prevCategoryKey.current !== '' && prevCategoryKey.current !== categoryKey;
    prevCategoryKey.current = categoryKey;

    // Issue a new request token — any response with an older token will be ignored
    const myToken = ++trendReqToken.current;

    setError(null);
    if (!hasDataRef.current) setLoading(true);

    // On category change, clear old data immediately so stale KPI/chart is not shown
    if (isCategoryChange) {
      setTrendRaw([]);
      setViewData([]);
      setBrandListRaw([]);
      hasDataRef.current = false;
    }

    (async () => {
      // Fetch trend and brand list in parallel
      const [trend, brandList] = await Promise.all([
        fetchCrawlerView('品类视角-大盘趋势', categoryList, brand, controller.signal),
        fetchCrawlerView('品类视角-品牌列表', categoryList, brand, controller.signal).catch(() => null),
      ]);

      // Ignore response if a newer request has been issued or this was aborted
      if (controller.signal.aborted || myToken !== trendReqToken.current) return;

      if (Array.isArray(trend)) {
        setTrendRaw(trend);
        if (trend.length > 0) hasDataRef.current = true;
      } else if (trend === null) {
        setTrendRaw([]);
        setViewData([]);
        setBrandListRaw([]);
        hasDataRef.current = false;
        setError('数据加载失败，MCP服务可能正忙，请稍后重试');
      }

      // Brand list for KPI calculation (failure doesn't block main flow)
      if (Array.isArray(brandList)) {
        setBrandListRaw(brandList);
      } else {
        setBrandListRaw([]);
      }

      setLoading(false);
    })();

    return () => { controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedFilters.industry,
    debouncedFilters.category,
    debouncedFilters.subcategory,
    debouncedFilters.brand,
    refreshNonce,
  ]);

  /* ---------- 5b. Fetch view-specific data — refetches on tab switch AND filter change ---------- */
  useEffect(() => {
    if (!debouncedFilters.industry || !debouncedFilters.category) return;

    const controller = new AbortController();
    viewAbortRef.current = controller;

    const categoryList = [
      debouncedFilters.industry,
      debouncedFilters.category,
      subcategoryForApi(debouncedFilters.subcategory),
    ];
    const brand = debouncedFilters.brand === '全部品牌' ? '' : debouncedFilters.brand;

    const viewMap: Record<string, string> = {
      '大盘趋势': '品类视角-大盘趋势',
      '品牌排行': '品类视角-品牌列表',
      '销售价量': '品类视角-销售价量',
      '店铺列表': '品类视角-店铺列表',
      '商品列表': '品类视角-商品列表',
      '价格区间': '品类视角-价格区间',
      '价格交叉': '品类视角-价格交叉',
      '热词频次': '品类视角-热词频次',
    };
    const targetView = viewMap[activeView] || '品类视角-大盘趋势';

    // For 大盘趋势 tab, view data is derived from trendRaw (already fetched by effect 5a)
    if (targetView === '品类视角-大盘趋势') {
      setViewLoading(false);
      return;
    }

    // Race-condition guard for view fetches
    const myViewToken = ++viewReqToken.current;
    setViewLoading(true);

    (async () => {
      const view = await fetchCrawlerView(
        targetView,
        categoryList,
        brand,
        controller.signal,
      );

      if (controller.signal.aborted || myViewToken !== viewReqToken.current) return;

      if (Array.isArray(view)) {
        setViewData(normalizeViewData(activeView, view));
      } else if (view === null) {
        setViewData([]);
        setError('视图数据加载失败，请稍后重试或切换其他视图');
      }
      setViewLoading(false);
    })();

    return () => { controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeView,
    debouncedFilters.industry,
    debouncedFilters.category,
    debouncedFilters.subcategory,
    debouncedFilters.brand,
    refreshNonce,
    // NOTE: month range intentionally excluded — MCP always returns 13 months,
    // time filtering is done client-side. No need to refetch.
  ]);

  /* ---------- 5c. Fetch real brands when category/subcategory changes ---------- */
  useEffect(() => {
    if (!debouncedFilters.industry || !debouncedFilters.category) return;
    const categoryList = [
      debouncedFilters.industry,
      debouncedFilters.category,
      subcategoryForApi(debouncedFilters.subcategory),
    ];

    let cancelled = false;
    async function loadBrands() {
      setBrandsLoading(true);
      try {
        const res = await fetch(
          `/api/market-monitor/brands?category=${encodeURIComponent(JSON.stringify(categoryList))}`
        );
        const json = await res.json();
        if (!cancelled && json.success && json.data?.brands) {
          const brandNames = json.data.brands.map((b: { name: string }) => b.name);
          setRealBrands(brandNames);
        }
      } catch {
        // Keep existing brands on failure
      } finally {
        if (!cancelled) setBrandsLoading(false);
      }
    }
    loadBrands();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFilters.industry, debouncedFilters.category, debouncedFilters.subcategory]);

  /* ---------- 6. Event handlers (functional updates) ---------- */
  const handleIndustryChange = useCallback((v: string) => {
    setFilters((prev) => {
      const cats = categoryTree[v] ? Object.keys(categoryTree[v]) : [];
      const firstCat = cats[0] || '';
      const subs = firstCat && categoryTree[v]?.[firstCat] ? categoryTree[v][firstCat] : [];
      const firstSub = subs[0] || ALL_SUBCATEGORY;
      return {
        ...prev,
        industry: v,
        category: firstCat,
        subcategory: firstSub,
        brand: '全部品牌',
      };
    });
  }, [categoryTree]);

  const handleCategoryChange = useCallback((v: string) => {
    setFilters((prev) => {
      return { ...prev, category: v, subcategory: ALL_SUBCATEGORY, brand: '全部品牌' };
    });
  }, []);

  const handleBrandChange = useCallback((v: string) => {
    setFilters((prev) => ({ ...prev, brand: v }));
  }, []);

  const handleMonthFromChange = useCallback((v: string) => {
    const from = v === ALL_MONTH ? '' : v;
    setFilters((prev) => {
      // 钳制：开始月晚于结束月时，把结束月拉齐到开始月
      let to = prev.monthTo;
      if (from && to && Number(to) < Number(from)) to = from;
      return { ...prev, monthFrom: from, monthTo: to };
    });
  }, []);

  const handleMonthToChange = useCallback((v: string) => {
    const to = v === ALL_MONTH ? '' : v;
    setFilters((prev) => {
      // 钳制：结束月早于开始月时，把开始月拉齐到结束月
      let from = prev.monthFrom;
      if (to && from && Number(from) > Number(to)) from = to;
      return { ...prev, monthFrom: from, monthTo: to };
    });
  }, []);

  const handleViewChange = (key: string) => {
    setActiveView(key);
  };

  const handleRefresh = () => {
    setRefreshNonce((n) => n + 1);
  };

  /* ---------- 7. View content renderer ---------- */
  const renderViewContent = () => {
    // For 大盘趋势 tab, derive view data directly from trendRaw (no separate fetch)
    const activeViewData = activeView === '大盘趋势'
      ? normalizeViewData('大盘趋势', trendRaw)
      : viewData;

    // Apply month-range filter for date-based views
    const dateViews = ['大盘趋势', '销售价量', '品牌排行'];
    const mvFrom = availableMonths.includes(Number(debouncedFilters.monthFrom)) ? debouncedFilters.monthFrom : '';
    const mvTo = availableMonths.includes(Number(debouncedFilters.monthTo)) ? debouncedFilters.monthTo : '';
    let filteredViewData = dateViews.includes(activeView)
      ? filterViewByMonthRange(activeViewData, mvFrom, mvTo)
      : activeViewData;
    // 品牌排行：原始为「品牌 × 月份」明细，需按品牌汇总（销售额/销量求和、均价=销额/销量、份额重算）。
    // 区间过滤前先聚合也兼容（全量 13 个月同样需要去重），故品牌排行一律走聚合。
    if (activeView === '品牌排行') {
      const map = new Map<string, any>();
      for (const r of filteredViewData as any[]) {
        const g = map.get(r.name) || { ...r, sales: 0, volume: 0 };
        g.sales += Number(r.sales) || 0;
        g.volume += Number(r.volume) || 0;
        map.set(r.name, g);
      }
      const total = [...map.values()].reduce((s, r) => s + (r.sales || 0), 0);
      filteredViewData = [...map.values()]
        .map((r) => ({
          ...r,
          share: total > 0 ? +(((r.sales as number) / total) * 100).toFixed(2) : 0,
          avgPrice: r.volume > 0 ? Math.round((r.sales as number) / r.volume) : 0,
          yoy: '-',
        }))
        .sort((a, b) => b.sales - a.sales)
        .map((r, i) => ({ ...r, rank: i + 1, color: CHART_COLORS[i % CHART_COLORS.length] }));
    }

    switch (activeView) {
      case '大盘趋势':
        return <TrendView loading={loading} data={filteredViewData} />;
      case '品牌排行':
        return <BrandRankingView loading={viewLoading} data={filteredViewData} />;
      case '销售价量':
        return <PriceVolumeView loading={viewLoading} data={filteredViewData} xKey="label" />;
      case '店铺列表':
        return (
          <DataTableView
            loading={viewLoading}
            data={filteredViewData.map((d) => ({
              rank: d.id,
              name: d.name,
              platform: d.platform,
              sales: formatSalesShort(d.sales),
              volume: formatVolumeShort(d.volume),
              avgPrice: d.avgPrice ? '¥' + Number(d.avgPrice).toLocaleString() : '-',
            }))}
            columns={[
              { key: 'rank', label: '排名' },
              { key: 'name', label: '店铺名称' },
              { key: 'platform', label: '平台' },
              { key: 'sales', label: '销售额', align: 'right' },
              { key: 'volume', label: '销量', align: 'right' },
              { key: 'avgPrice', label: '均价', align: 'right' },
            ]}
          />
        );
      case '商品列表':
        return (
          <DataTableView
            loading={viewLoading}
            data={filteredViewData.map((d) => ({
              rank: d.id,
              name: d.name,
              brand: d.brand,
              price: d.price ? '¥' + Number(d.price).toLocaleString() : '-',
              sales: formatSalesShort(d.sales),
              volume: formatVolumeShort(d.volume),
            }))}
            columns={[
              { key: 'rank', label: '排名' },
              { key: 'name', label: '商品名称' },
              { key: 'brand', label: '品牌' },
              { key: 'price', label: '价格', align: 'right' },
              { key: 'sales', label: '销售额', align: 'right' },
              { key: 'volume', label: '销量', align: 'right' },
            ]}
          />
        );
      case '价格区间':
        return <PriceVolumeView loading={viewLoading} data={filteredViewData} xKey="range" />;
      case '价格交叉':
        return <PriceCrossView loading={viewLoading} data={filteredViewData} />;
      case '热词频次':
        return <HotwordsView loading={viewLoading} data={filteredViewData} />;
      default:
        return <div className="text-center py-12 text-muted-foreground">暂无数据</div>;
    }
  };

  /* ---------- 8. Render ---------- */
  if (treeLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[400px] w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Industry */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">行业</span>
              <Select
                value={filters.industry}
                onValueChange={handleIndustryChange}
              >
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {industries.map((ind) => (
                    <SelectItem key={ind} value={ind}>
                      {ind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">品类</span>
              <Select
                value={filters.category}
                onValueChange={handleCategoryChange}
              >
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* SubCategory (三级品类) */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">细分品类</span>
              <Select
                value={filters.subcategory}
                onValueChange={(v) => setFilters(prev => ({ ...prev, subcategory: v, brand: '全部品牌' }))}
              >
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue placeholder="选择细分品类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SUBCATEGORY}>全部</SelectItem>
                  {subCategories.map((sub) => (
                    <SelectItem key={sub} value={sub}>
                      {sub}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Brand */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">品牌</span>
              <Select
                value={filters.brand}
                onValueChange={handleBrandChange}
                disabled={brandsLoading}
              >
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue placeholder={brandsLoading ? '加载中…' : '全部品牌'} />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Month Range */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">时间</span>
              <Select
                value={availableMonths.includes(Number(debouncedFilters.monthFrom)) ? debouncedFilters.monthFrom : ALL_MONTH}
                onValueChange={handleMonthFromChange}
              >
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue placeholder="开始月份" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MONTH}>开始月份</SelectItem>
                  {[...availableMonths].reverse().map((m) => (
                    <SelectItem key={`f${m}`} value={String(m)}>
                      {monthOptLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">至</span>
              <Select
                value={availableMonths.includes(Number(debouncedFilters.monthTo)) ? debouncedFilters.monthTo : ALL_MONTH}
                onValueChange={handleMonthToChange}
              >
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue placeholder="结束月份" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MONTH}>结束月份</SelectItem>
                  {[...availableMonths].reverse().map((m) => (
                    <SelectItem key={`t${m}`} value={String(m)}>
                      {monthOptLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1" />

            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading || viewLoading}>
              <RefreshCw className={cn('h-4 w-4 mr-1', (loading || viewLoading) && 'animate-spin')} />
              刷新数据
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading && trendRaw.length === 0
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))
          : kpiCards.map((card, i) => (
              <KpiCardComp key={i} {...card} />
            ))}
      </div>

      {/* Error banner with retry */}
      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-red-400">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            重试
          </Button>
        </div>
      )}

      {/* Data cutoff notice */}
      <div className="text-xs text-muted-foreground -mt-2">
        数据来源：久谦中台 · 数据截止至2个月前，每月更新一次
      </div>

      {/* Data Views */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              数据视角
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {/* View Tabs */}
          <div className="flex flex-wrap gap-1.5 mb-6 pb-4 border-b border-border">
            {VIEWS.map((view) => (
              <Button
                key={view.key}
                variant={activeView === view.key ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewChange(view.key)}
                className={cn(
                  activeView === view.key &&
                    'bg-gradient-to-r from-[#4158D0] to-[#C850C0] text-white border-0',
                )}
              >
                {view.label}
              </Button>
            ))}
          </div>

          {/* View Content */}
          <div className="relative">
            {(loading || viewLoading) && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-[1px]">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  数据加载中…
                </div>
              </div>
            )}
            {renderViewContent()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
