'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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

const INDUSTRIES = ['数码电子', '家用电器', '美妆个护', '食品饮料', '服装鞋帽'];

const INDUSTRY_CATEGORIES: Record<string, string[]> = {
  '数码电子': ['手机', '电脑', '平板', '智能手表', '耳机'],
  '家用电器': ['电视', '冰箱', '洗衣机', '空调', '厨房电器'],
  '美妆个护': ['护肤', '彩妆', '个护清洁', '香水', '美容仪器'],
  '食品饮料': ['乳品', '饮料', '零食', '茶叶', '酒水'],
  '服装鞋帽': ['男装', '女装', '鞋靴', '箱包', '内衣'],
};

const INDUSTRY_BRANDS: Record<string, string[]> = {
  '数码电子': ['全部品牌', 'vivo', 'iQOO', '华为', '小米', 'OPPO', '荣耀', '苹果'],
  '家用电器': ['全部品牌', '海尔', '美的', '格力', '海信', 'TCL', '松下'],
  '美妆个护': ['全部品牌', '雅诗兰黛', '兰蔻', '欧莱雅', '珀莱雅', '薇诺娜', '花西子'],
  '食品饮料': ['全部品牌', '蒙牛', '伊利', '农夫山泉', '可口可乐', '三只松鼠', '元气森林'],
  '服装鞋帽': ['全部品牌', '耐克', '阿迪达斯', '安踏', '李宁', '优衣库', 'ZARA'],
};

const TIME_RANGES = ['近30天', '近90天', '近半年', '近一年', '本年度'];

/* ========== Mock Data Generators ========== */
function generateTrendData() {
  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const sales = Math.floor(80000 + Math.random() * 40000 + (11 - i) * 2000);
    const volume = Math.floor(200 + Math.random() * 100 + (11 - i) * 5);
    months.push({
      month,
      label: `${d.getMonth() + 1}月`,
      sales,
      volume,
    });
  }
  return months;
}

function generateBrandRanking() {
  const brands = [
    { name: 'vivo', color: '#4158D0' },
    { name: 'iQOO', color: '#FF6B35' },
    { name: '华为', color: '#FF4D4F' },
    { name: '小米', color: '#FAAD14' },
    { name: 'OPPO', color: '#52C41A' },
    { name: '荣耀', color: '#1890FF' },
    { name: '苹果', color: '#722ED1' },
    { name: '真我', color: '#13C2C2' },
  ];
  let total = 0;
  const data = brands.map((b, i) => {
    const sales = Math.floor(50000 - i * 4500 + Math.random() * 3000);
    const avgPrice = Math.floor(2000 + Math.random() * 3000);
    total += sales;
    return { ...b, sales, avgPrice, rank: i + 1 };
  });
  return data.map((d) => ({ ...d, share: ((d.sales / total) * 100).toFixed(1) }));
}

function generatePriceVolumeData() {
  const priceRanges = [
    '0-999',
    '1000-1999',
    '2000-2999',
    '3000-3999',
    '4000-5999',
    '6000-7999',
    '8000+',
  ];
  return priceRanges.map((range) => ({
    range,
    sales: Math.floor(5000 + Math.random() * 25000),
    volume: Math.floor(1000 + Math.random() * 5000),
  }));
}

function generateShopList() {
  const shops = [
    'vivo官方旗舰店',
    'iQOO官方旗舰店',
    '华为官方旗舰店',
    '小米官方旗舰店',
    'OPPO官方旗舰店',
    '荣耀官方旗舰店',
    'Apple产品京东自营',
    'realme真我官方旗舰店',
  ];
  return shops.map((name, i) => ({
    id: i + 1,
    name,
    platform: ['京东', '天猫', '抖音'][i % 3],
    sales: Math.floor(10000 - i * 800 + Math.random() * 2000),
    volume: Math.floor(500 - i * 40 + Math.random() * 100),
    avgPrice: Math.floor(2000 + Math.random() * 3000),
    rating: (4.5 + Math.random() * 0.5).toFixed(1),
  }));
}

function generateProductList() {
  const products = [
    'vivo X200 Pro',
    'iQOO 13 Pro',
    '华为Mate 70 Pro',
    '小米15 Ultra',
    'OPPO Find X8',
    '荣耀Magic7',
    'iPhone 16 Pro',
    'realme GT7 Pro',
    'vivo S20',
    'iQOO Neo10',
  ];
  return products.map((name, i) => ({
    id: i + 1,
    name,
    price: Math.floor(1999 + Math.random() * 6000),
    sales: Math.floor(5000 - i * 300 + Math.random() * 1000),
    volume: Math.floor(200 - i * 15 + Math.random() * 50),
    brand: products[i].split(' ')[0],
  }));
}

function generateHotwords() {
  const words = [
    '5G手机',
    '拍照手机',
    '游戏手机',
    '折叠屏',
    '长续航',
    '快充',
    '旗舰芯片',
    '曲面屏',
    '轻薄机身',
    '大内存',
    '高刷屏幕',
    'AI手机',
  ];
  return words
    .map((word, i) => ({
      word,
      count: Math.floor(5000 - i * 300 + Math.random() * 500),
      trend: (Math.random() - 0.4) * 100,
    }))
    .sort((a, b) => b.count - a.count);
}

function generatePriceCrossData() {
  const ranges = ['1000以下', '1000-2000', '2000-3000', '3000-4000', '4000-6000', '6000以上'];
  return ranges.map((range, i) => ({
    range,
    online: Math.floor(3000 + i * 2000 + Math.random() * 1500),
    offline: Math.floor(2000 + i * 1500 + Math.random() * 1000),
    total: Math.floor(5000 + i * 3500 + Math.random() * 2000),
  }));
}

/* ========== KPI Cards ========== */
function KpiCard({ label, value, change, icon, color }: KpiCard) {
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
    volume: { label: '销量(万)', color: '#C850C0' },
  };

  if (loading) {
    return (
      <div className="h-[400px] flex items-center justify-center">
        <Skeleton className="h-[350px] w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="h-[400px]">
      <ChartContainer config={chartConfig} className="h-full">
        <AreaChart data={data}>
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
            name="销量(万)"
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
      {/* Ranking Table */}
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
                  {brand.sales.toLocaleString()}万
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

      {/* Pie Chart */}
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

function PriceVolumeView({ loading, data }: { loading: boolean; data: any[] }) {
  const chartConfig = {
    sales: { label: '销售额(万)', color: '#4158D0' },
    volume: { label: '销量', color: '#C850C0' },
  };

  if (loading) {
    return <Skeleton className="h-[400px] w-full rounded-lg" />;
  }

  return (
    <div className="h-[400px]">
      <ChartContainer config={chartConfig} className="h-full">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="range" stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="sales" name="销售额(万)" fill="#4158D0" radius={[4, 4, 0, 0]} />
          <Bar dataKey="volume" name="销量" fill="#C850C0" radius={[4, 4, 0, 0]} />
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

  const maxCount = Math.max(...data.map((d) => d.count));

  return (
    <div className="space-y-6">
      {/* Word Cloud Style Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {data.map((item, i) => {
          const size = 12 + (item.count / maxCount) * 16;
          const isUp = item.trend >= 0;
          return (
            <Card
              key={item.word}
              className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer"
            >
              <CardContent className="p-4 text-center">
                <div
                  className="font-bold mb-1"
                  style={{
                    fontSize: `${size}px`,
                    background: 'linear-gradient(to right, #4158D0, #C850C0)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {item.word}
                </div>
                <div className="text-xs text-muted-foreground">
                  {item.count.toLocaleString()} 次
                </div>
                <div
                  className={cn(
                    'text-[10px] mt-1 flex items-center justify-center gap-0.5',
                    isUp ? 'text-emerald-400' : 'text-red-400',
                  )}
                >
                  {isUp ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                  {isUp ? '+' : ''}{item.trend.toFixed(1)}%
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Ranking List */}
      <DataTableView
        loading={false}
        data={data.map((d, i) => ({
          rank: i + 1,
          word: d.word,
          count: d.count.toLocaleString(),
          trend: `${d.trend >= 0 ? '+' : ''}${d.trend.toFixed(1)}%`,
        }))}
        columns={[
          { key: 'rank', label: '排名' },
          { key: 'word', label: '热词' },
          { key: 'count', label: '搜索频次', align: 'right' },
          { key: 'trend', label: '变化趋势', align: 'right' },
        ]}
      />
    </div>
  );
}

function PriceCrossView({ loading, data }: { loading: boolean; data: any[] }) {
  const chartConfig = {
    online: { label: '线上', color: '#4158D0' },
    offline: { label: '线下', color: '#C850C0' },
  };

  if (loading) return <Skeleton className="h-[400px] w-full rounded-lg" />;

  return (
    <div className="h-[400px]">
      <ChartContainer config={chartConfig} className="h-full">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="range" stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="online" name="线上(万)" fill="#4158D0" stackId="a" />
          <Bar dataKey="offline" name="线下(万)" fill="#C850C0" stackId="a" />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/* ========== Main Component ========== */
export default function EcommercePage() {
  const [activeView, setActiveView] = useState('大盘趋势');
  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<any[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    industry: '数码电子',
    category: '手机',
    brand: '全部品牌',
    timeRange: '近90天',
  });

  // KPI Data
  const kpiCards: KpiCard[] = [
    {
      label: '总销售额',
      value: '¥286.5万',
      change: 12.8,
      icon: <DollarSign className="h-5 w-5" />,
      color: '#4158D0',
    },
    {
      label: '总销量',
      value: '8.6万件',
      change: 8.3,
      icon: <Package className="h-5 w-5" />,
      color: '#C850C0',
    },
    {
      label: '平均价格',
      value: '¥3,331',
      change: -2.1,
      icon: <Tag className="h-5 w-5" />,
      color: '#10B981',
    },
    {
      label: '品牌数',
      value: '128个',
      change: 5.6,
      icon: <Building2 className="h-5 w-5" />,
      color: '#F59E0B',
    },
  ];

  const fetchViewData = useCallback(
    async (viewKey: string) => {
      setLoading(true);
      try {
        const view = VIEWS.find((v) => v.key === viewKey);
        if (!view) return;

        const res = await fetch('/api/market-monitor/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `查看${filters.category}类目${viewKey}数据`,
            category: [filters.industry, filters.category],
            brand: filters.brand === '全部品牌' ? '' : filters.brand,
          }),
        });
        const json = await res.json();

        // If API returns valid array data, use it; otherwise fall back to mock
        if (json.success && json.data?.data && Array.isArray(json.data.data)) {
          setViewData(json.data.data);
        } else {
          // Fallback: generate mock data based on view type
          setTimeout(() => {
            switch (viewKey) {
              case '大盘趋势':
                setViewData(generateTrendData());
                break;
              case '品牌排行':
                setViewData(generateBrandRanking());
                break;
              case '销售价量':
                setViewData(generatePriceVolumeData());
                break;
              case '店铺列表':
                setViewData(generateShopList());
                break;
              case '商品列表':
                setViewData(generateProductList());
                break;
              case '价格区间':
                setViewData(generatePriceVolumeData());
                break;
              case '价格交叉':
                setViewData(generatePriceCrossData());
                break;
              case '热词频次':
                setViewData(generateHotwords());
                break;
              default:
                setViewData([]);
            }
          }, 500);
        }
      } catch {
        // Fallback to mock on error
        setTimeout(() => {
          switch (viewKey) {
            case '大盘趋势':
              setViewData(generateTrendData());
              break;
            case '品牌排行':
              setViewData(generateBrandRanking());
              break;
            case '销售价量':
              setViewData(generatePriceVolumeData());
              break;
            case '店铺列表':
              setViewData(generateShopList());
              break;
            case '商品列表':
              setViewData(generateProductList());
              break;
            case '价格区间':
              setViewData(generatePriceVolumeData());
              break;
            case '价格交叉':
              setViewData(generatePriceCrossData());
              break;
            case '热词频次':
              setViewData(generateHotwords());
              break;
            default:
              setViewData([]);
          }
        }, 500);
      } finally {
        setTimeout(() => setLoading(false), 300);
      }
    },
    [filters],
  );

  // Initial load
  useEffect(() => {
    fetchViewData(activeView);
  }, [activeView, fetchViewData]);

  // Industry change: reset category & brand to match new industry
  useEffect(() => {
    const cats = INDUSTRY_CATEGORIES[filters.industry] || [];
    const brands = INDUSTRY_BRANDS[filters.industry] || [];
    setFilters((f) => ({
      ...f,
      category: cats.includes(f.category) ? f.category : (cats[0] ?? ''),
      brand: brands.includes(f.brand) ? f.brand : (brands[0] ?? ''),
    }));
  }, [filters.industry]);

  const handleViewChange = (key: string) => {
    setActiveView(key);
  };

  const handleRefresh = () => {
    fetchViewData(activeView);
  };

  const renderViewContent = () => {
    switch (activeView) {
      case '大盘趋势':
        return <TrendView loading={loading} data={viewData} />;
      case '品牌排行':
        return <BrandRankingView loading={loading} data={viewData} />;
      case '销售价量':
        return <PriceVolumeView loading={loading} data={viewData} />;
      case '店铺列表':
        return (
          <DataTableView
            loading={loading}
            data={viewData.map((d) => ({
              rank: d.id,
              name: d.name,
              platform: d.platform,
              sales: d.sales.toLocaleString() + '万',
              volume: d.volume.toLocaleString(),
              avgPrice: '¥' + d.avgPrice.toLocaleString(),
              rating: d.rating,
            }))}
            columns={[
              { key: 'rank', label: '排名' },
              { key: 'name', label: '店铺名称' },
              { key: 'platform', label: '平台' },
              { key: 'sales', label: '销售额', align: 'right' },
              { key: 'volume', label: '销量', align: 'right' },
              { key: 'avgPrice', label: '均价', align: 'right' },
              { key: 'rating', label: '评分', align: 'right' },
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
              price: '¥' + d.price.toLocaleString(),
              sales: d.sales.toLocaleString() + '万',
              volume: d.volume.toLocaleString(),
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
        return <PriceVolumeView loading={loading} data={viewData} />;
      case '价格交叉':
        return <PriceCrossView loading={loading} data={viewData} />;
      case '热词频次':
        return <HotwordsView loading={loading} data={viewData} />;
      default:
        return <div className="text-center py-12 text-muted-foreground">暂无数据</div>;
    }
  };

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
                onValueChange={(v) => setFilters((f) => ({ ...f, industry: v }))}
              >
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((ind) => (
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
                onValueChange={(v) => setFilters((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(INDUSTRY_CATEGORIES[filters.industry] || []).map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
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
                onValueChange={(v) => setFilters((f) => ({ ...f, brand: v }))}
              >
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(INDUSTRY_BRANDS[filters.industry] || []).map((b) => (
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
                onValueChange={(v) => setFilters((f) => ({ ...f, timeRange: v }))}
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
          <KpiCard key={i} {...card} />
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
