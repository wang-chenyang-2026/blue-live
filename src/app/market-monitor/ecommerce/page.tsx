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
  timeRange: string;
}

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

const TIME_RANGES = ['近30天', '近90天', '近半年', '近一年', '本年度'];

/* ========== Mock Data for Fallback ========== */
const MOCK_BRANDS = ['品牌A', '品牌B', '品牌C', '品牌D', '品牌E', '品牌F', '品牌G', '品牌H'];

const CHART_COLORS = ['#4158D0', '#FF6B35', '#FF4D4F', '#FAAD14', '#52C41A', '#1890FF', '#722ED1', '#13C2C2'];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getHotwordsForIndustry(_industry: string, category: string): { word: string }[] {
  const hash = hashString(_industry + category);
  const words = [
    `${category}推荐`, `${category}排行榜`, `性价比${category}`, `高端${category}`,
    `平价${category}`, `${category}品牌`, `${category}测评`, `${category}对比`,
    `${category}选购`, `新款${category}`, `热销${category}`, `${category}优惠`,
  ];
  // 打乱顺序
  const shuffled = [...words];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (hash + i * 13) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.map(w => ({ word: w }));
}

function getPriceRangesForIndustry(industry: string): string[] {
  const hash = hashString(industry);
  const pattern = hash % 4;
  if (pattern === 0) {
    return ['0-99', '100-299', '300-599', '600-999', '1000-1999', '2000-4999', '5000+'];
  } else if (pattern === 1) {
    return ['0-49', '50-99', '100-199', '200-399', '400-699', '700-1499', '1500+'];
  } else if (pattern === 2) {
    return ['0-199', '200-499', '500-999', '1000-2999', '3000-5999', '6000-9999', '10000+'];
  } else {
    return ['0-19', '20-49', '50-99', '100-199', '200-499', '500-999', '1000+'];
  }
}

/* ========== Mock Data Generators ========== */

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateTrendData(industry: string, category: string) {
  const seed = hashString(industry + category + 'trend');
  const rand = seededRandom(seed);
  const months = [];
  const now = new Date();
  const baseSales = 50000 + (hashString(industry) % 50000);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const sales = Math.floor(baseSales + rand() * 30000 + (11 - i) * 1500);
    const volume = Math.floor(100 + rand() * 80 + (11 - i) * 3);
    months.push({
      month,
      label: `${d.getMonth() + 1}月`,
      sales,
      volume,
    });
  }
  return months;
}

function generateBrandRanking(industry: string, category: string) {
  const seed = hashString(industry + category + 'brand');
  const rand = seededRandom(seed);
  const brandList = MOCK_BRANDS.map((name, i) => ({ name, color: CHART_COLORS[i % CHART_COLORS.length] }));
  let total = 0;
  const data = brandList.map((b, i) => {
    const sales = Math.floor(40000 - i * 3500 + rand() * 5000);
    const avgPrice = Math.floor(500 + rand() * 3000);
    total += sales;
    return { ...b, sales, avgPrice, rank: i + 1 };
  });
  return data.map((d) => ({ ...d, share: ((d.sales / total) * 100).toFixed(1) }));
}

function generatePriceVolumeData(industry: string, category: string) {
  const seed = hashString(industry + category + 'pricevol');
  const rand = seededRandom(seed);
  const ranges = getPriceRangesForIndustry(industry);
  return ranges.map((range) => ({
    range,
    sales: Math.floor(3000 + rand() * 25000),
    volume: Math.floor(500 + rand() * 5000),
  }));
}

function generateShopList(industry: string, category: string) {
  const seed = hashString(industry + category + 'shop');
  const rand = seededRandom(seed);
  const names = MOCK_BRANDS.map(b => `${b}官方旗舰店`);
  return names.map((name, i) => ({
    id: i + 1,
    name,
    platform: ['京东', '天猫', '抖音'][i % 3],
    sales: Math.floor(8000 - i * 600 + rand() * 2000),
    volume: Math.floor(400 - i * 30 + rand() * 100),
    avgPrice: Math.floor(500 + rand() * 3000),
    rating: (4.5 + rand() * 0.5).toFixed(1),
  }));
}

function generateProductList(industry: string, category: string) {
  const seed = hashString(industry + category + 'product');
  const rand = seededRandom(seed);
  const brands = MOCK_BRANDS;
  const productModifiers = ['旗舰款', '经典款', '豪华款', '基础款', '升级款', '新款', 'Pro版', 'Max版', '标准版', '青春版'];
  const products = brands.map((brand, i) => ({
    name: `${brand} ${category}${productModifiers[i % productModifiers.length]}`,
    brand,
  }));
  return products.map((p, i) => ({
    id: i + 1,
    name: p.name,
    price: Math.floor(100 + rand() * 5000),
    sales: Math.floor(4000 - i * 250 + rand() * 1000),
    volume: Math.floor(150 - i * 10 + rand() * 50),
    brand: p.brand,
  }));
}

function generateHotwords(industry: string, category: string) {
  const seed = hashString(industry + category + 'hotwords');
  const rand = seededRandom(seed);
  const words = getHotwordsForIndustry(industry, category);
  return words
    .map((item, i) => ({
      word: item.word,
      count: Math.floor(4000 - i * 250 + rand() * 500),
      trend: (rand() - 0.4) * 100,
    }))
    .sort((a, b) => b.count - a.count);
}

function generatePriceCrossData(industry: string, category: string) {
  const seed = hashString(industry + category + 'pricecross');
  const rand = seededRandom(seed);
  const ranges = getPriceRangesForIndustry(industry);
  return ranges.map((range, i) => ({
    range,
    online: Math.floor(2000 + i * 1500 + rand() * 1500),
    offline: Math.floor(1500 + i * 1000 + rand() * 1000),
    total: Math.floor(3500 + i * 2500 + rand() * 2000),
  }));
}

/* ========== KPI Calculation ========== */
/**
 * 基于大盘趋势原始数据计算 KPI
 */
function buildKpiFromTrend(raw: any[], realBrandCount: number): KpiCard[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [
      { label: '总销售额', value: '—', change: 0, icon: <DollarSign className="h-5 w-5" />, color: '#4158D0' },
      { label: '总销量', value: '—', change: 0, icon: <Package className="h-5 w-5" />, color: '#C850C0' },
      { label: '平均价格', value: '—', change: 0, icon: <Tag className="h-5 w-5" />, color: '#10B981' },
      { label: '品牌数', value: realBrandCount > 0 ? `${realBrandCount}个` : '—', change: 0, icon: <Building2 className="h-5 w-5" />, color: '#F59E0B' },
    ];
  }

  const byMonth = new Map<number, { sales: number; volume: number }>();
  for (const r of raw) {
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

  const now = new Date();
  const curMonth = now.getFullYear() * 100 + (now.getMonth() + 1);
  let lastMonthIdx = months.length - 1;
  if (months[lastMonthIdx] === curMonth) lastMonthIdx -= 1;
  const prevMonthIdx = lastMonthIdx - 1;

  let salesMom = 0;
  let volumeMom = 0;
  let priceMom = 0;
  if (lastMonthIdx >= 1 && prevMonthIdx >= 0) {
    const cur = byMonth.get(months[lastMonthIdx])!;
    const prev = byMonth.get(months[prevMonthIdx])!;
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
function TrendView({ loading, data }: { loading: boolean; data: any[] }) {
  const chartConfig = {
    sales: { label: '销售额(万)', color: '#4158D0' },
    volume: { label: '销量(万件)', color: '#C850C0' },
  };

  // 按月份聚合跨平台数据，并把元/件换算成万
  const chartData = useMemo(() => {
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
        sales: +(v.sales / 1e4).toFixed(1),           // 万元
        volume: +(v.volume / 1e4).toFixed(2),          // 万件
      }));
  }, [data]);

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
    <div className="h-[400px]">
      <ChartContainer config={chartConfig} className="h-full">
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
                  className={cn(col.align === 'right' && 'text-right font-mono tabular-nums')}
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
  const [viewData, setViewData] = useState<any[]>([]);
  const [categoryTree, setCategoryTree] = useState<CategoryTree>({});
  const [treeLoading, setTreeLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    industry: '',
    category: '',
    subcategory: '',
    brand: '',
    timeRange: '近90天',
  });
  const [realBrands, setRealBrands] = useState<string[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  // 大盘趋势原始数据（用于 KPI 计算，单位：元/件）
  const [trendRaw, setTrendRaw] = useState<any[]>([]);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // AbortController ref for cancelling stale requests
  const abortControllerRef = useRef<AbortController | null>(null);

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
          const firstSubcategory = firstIndustry && firstCategory && tree[firstIndustry]?.[firstCategory]
            ? tree[firstIndustry][firstCategory][0] || ''
            : '';
          const firstBrand = '全部品牌';
          setFilters({
            industry: firstIndustry,
            category: firstCategory,
            subcategory: firstSubcategory,
            brand: firstBrand,
            timeRange: '近90天',
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

  /* ---------- 3. KPI cards（基于大盘趋势真实数据计算） ---------- */
  const kpiCards: KpiCard[] = useMemo(
    () => buildKpiFromTrend(trendRaw, realBrands.length),
    [trendRaw, realBrands.length],
  );

  /* ---------- 3b. normalizeViewData: map Chinese field names to English ---------- */
  function normalizeViewData(viewKey: string, raw: any[]): any[] {
    if (!raw || raw.length === 0) return [];

    switch (viewKey) {
      case '品牌排行':
        return raw.map((item, i) => ({
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
          name: item['商品名称'] || item['商品'] || '-',
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
      timeRange: string,
      signal?: AbortSignal,
    ): Promise<any[] | null> => {
      try {
        const res = await fetch('/api/market-monitor/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `查看数据`,
            category: categoryList,
            brand: brand === '全部品牌' ? '' : brand,
            view: categoryView,
            timeRange,
          }),
          signal,
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

  /* ---------- 5. 单次 effect：同时拉取大盘趋势（KPI用）+ 当前视图数据 ---------- */
  useEffect(() => {
    if (!filters.industry || !filters.category) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const categoryList = filters.subcategory
      ? [filters.industry, filters.category, filters.subcategory]
      : [filters.industry, filters.category];
    const brand = filters.brand === '全部品牌' ? '' : filters.brand;

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

    setLoading(true);

    // 大盘趋势每次都拉，KPI 依赖它
    const trendP = fetchCrawlerView(
      '品类视角-大盘趋势',
      categoryList,
      brand,
      filters.timeRange,
      controller.signal,
    );

    // 当前视图非大盘趋势时再并行拉一份；否则复用 trendP
    const viewP =
      targetView === '品类视角-大盘趋势'
        ? trendP
        : fetchCrawlerView(targetView, categoryList, brand, filters.timeRange, controller.signal);

    (async () => {
      const [trend, view] = await Promise.all([trendP, viewP]);
      if (controller.signal.aborted) return;

      if (Array.isArray(trend)) {
        setTrendRaw(trend);
      } else {
        setTrendRaw([]);
      }

      if (Array.isArray(view)) {
        setViewData(normalizeViewData(activeView, view));
      } else {
        setViewData([]);
      }
      setLoading(false);
    })();

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, filters.industry, filters.category, filters.subcategory, filters.brand, filters.timeRange, refreshNonce]);

  /* ---------- 5b. Fetch real brands when category/subcategory changes ---------- */
  useEffect(() => {
    if (!filters.industry || !filters.category) return;
    const categoryList = filters.subcategory
      ? [filters.industry, filters.category, filters.subcategory]
      : [filters.industry, filters.category];

    let cancelled = false;
    async function loadBrands() {
      setBrandsLoading(true);
      try {
        const res = await fetch(
          `/api/market-monitor/brands?category=${encodeURIComponent(JSON.stringify(categoryList))}&timeRange=${encodeURIComponent(filters.timeRange)}`
        );
        const json = await res.json();
        if (!cancelled && json.success && json.data?.brands) {
          const brandNames = json.data.brands.map((b: { name: string }) => b.name);
          setRealBrands(brandNames);
        }
      } catch {
        // Silently fail, brand list will be empty
      } finally {
        if (!cancelled) setBrandsLoading(false);
      }
    }
    loadBrands();
    return () => { cancelled = true; };
  }, [filters.industry, filters.category, filters.subcategory, filters.timeRange]);

  /* ---------- 6. Event handlers (functional updates) ---------- */
  const handleIndustryChange = useCallback((v: string) => {
    setFilters((prev) => {
      const cats = categoryTree[v] ? Object.keys(categoryTree[v]) : [];
      const firstCat = cats[0] || '';
      const subs = firstCat && categoryTree[v]?.[firstCat] ? categoryTree[v][firstCat] : [];
      const firstSub = subs[0] || '';
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
      const subs = prev.industry && v && categoryTree[prev.industry]?.[v]
        ? categoryTree[prev.industry][v]
        : [];
      return { ...prev, category: v, subcategory: subs[0] || '' };
    });
  }, [categoryTree]);

  const handleBrandChange = useCallback((v: string) => {
    setFilters((prev) => ({ ...prev, brand: v }));
  }, []);

  const handleTimeRangeChange = useCallback((v: string) => {
    setFilters((prev) => ({ ...prev, timeRange: v }));
  }, []);

  const handleViewChange = (key: string) => {
    setActiveView(key);
  };

  const handleRefresh = () => {
    setRefreshNonce((n) => n + 1);
  };

  /* ---------- 7. View content renderer ---------- */
  const renderViewContent = () => {
    switch (activeView) {
      case '大盘趋势':
        return <TrendView loading={loading} data={viewData} />;
      case '品牌排行':
        return <BrandRankingView loading={loading} data={viewData} />;
      case '销售价量':
        return <PriceVolumeView loading={loading} data={viewData} xKey="label" />;
      case '店铺列表':
        return (
          <DataTableView
            loading={loading}
            data={viewData.map((d) => ({
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
            loading={loading}
            data={viewData.map((d) => ({
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
        return <PriceVolumeView loading={loading} data={viewData} xKey="range" />;
      case '价格交叉':
        return <PriceCrossView loading={loading} data={viewData} />;
      case '热词频次':
        return <HotwordsView loading={loading} data={viewData} />;
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
              >
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue />
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

            {/* Time Range */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">时间</span>
              <Select
                value={filters.timeRange}
                onValueChange={handleTimeRangeChange}
              >
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1" />

            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />
              刷新数据
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card, i) => (
          <KpiCardComp key={i} {...card} />
        ))}
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
          {renderViewContent()}
        </CardContent>
      </Card>
    </div>
  );
}
