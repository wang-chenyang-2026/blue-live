'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  TrendingUp,
  TrendingDown,
  MessageCircle,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Hash,
  Lightbulb,
  Users,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Area,
  AreaChart,
  ResponsiveContainer,
} from 'recharts';

/* ========== Mock Data Generators ========== */
function generateVolumeTrend() {
  const now = new Date();
  const data = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
    const base = 5000 + (29 - i) * 100;
    const vivo = Math.floor(base + Math.sin(i / 3) * 1500 + Math.random() * 800);
    const iqoo = Math.floor(base * 0.7 + Math.cos(i / 4) * 1000 + Math.random() * 600);
    const huawei = Math.floor(base * 1.2 + Math.sin(i / 5) * 1200 + Math.random() * 700);
    const xiaomi = Math.floor(base * 0.9 + Math.cos(i / 3) * 900 + Math.random() * 500);
    data.push({ date: dateStr, vivo, iqoo, huawei, xiaomi });
  }
  return data;
}

function generateSentimentData() {
  return [
    { name: '正面', value: 62, color: '#10B981' },
    { name: '中性', value: 28, color: '#6B7280' },
    { name: '负面', value: 10, color: '#EF4444' },
  ];
}

function generateHotTopics() {
  return [
    { rank: 1, topic: 'vivo X200 发布', volume: 85620, trend: 125.3, sentiment: '正面' },
    { rank: 2, topic: '拍照手机推荐', volume: 62340, trend: 18.7, sentiment: '中性' },
    { rank: 3, topic: '折叠屏手机测评', volume: 45890, trend: -5.2, sentiment: '中性' },
    { rank: 4, topic: 'iQOO 13 游戏性能', volume: 38720, trend: 42.1, sentiment: '正面' },
    { rank: 5, topic: '手机性价比排行', volume: 31250, trend: 8.9, sentiment: '中性' },
  ];
}

function generateCompetitorData() {
  return [
    {
      brand: 'vivo',
      color: '#4158D0',
      totalVolume: 256800,
      positiveRate: 62,
      engagement: 4.8,
      change: 15.3,
    },
    {
      brand: '华为',
      color: '#EF4444',
      totalVolume: 312500,
      positiveRate: 58,
      engagement: 5.2,
      change: 22.7,
    },
    {
      brand: '小米',
      color: '#F59E0B',
      totalVolume: 198700,
      positiveRate: 55,
      engagement: 4.1,
      change: 8.9,
    },
    {
      brand: 'iQOO',
      color: '#FF6B35',
      totalVolume: 176400,
      positiveRate: 65,
      engagement: 5.5,
      change: 28.4,
    },
    {
      brand: 'OPPO',
      color: '#10B981',
      totalVolume: 145600,
      positiveRate: 56,
      engagement: 3.9,
      change: 5.1,
    },
    {
      brand: '荣耀',
      color: '#3B82F6',
      totalVolume: 128900,
      positiveRate: 54,
      engagement: 3.7,
      change: 12.6,
    },
  ];
}

const BRANDS = ['vivo', 'iQOO', '华为', '小米', 'OPPO', '荣耀'];
const TIME_RANGES = ['近7天', '近15天', '近30天', '近90天'];

/* ========== Sentiment Badge ========== */
function SentimentBadge({ sentiment }: { sentiment: string }) {
  const configs: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    正面: {
      label: '正面',
      className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      icon: <ThumbsUp className="h-3 w-3" />,
    },
    中性: {
      label: '中性',
      className: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
      icon: <Minus className="h-3 w-3" />,
    },
    负面: {
      label: '负面',
      className: 'bg-red-500/15 text-red-400 border-red-500/30',
      icon: <ThumbsDown className="h-3 w-3" />,
    },
  };
  const cfg = configs[sentiment] || configs['中性'];
  return (
    <Badge variant="outline" className={cn('gap-1', cfg.className)}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

/* ========== Main Component ========== */
export default function BrandInsightPage() {
  const [selectedBrand, setSelectedBrand] = useState('vivo');
  const [timeRange, setTimeRange] = useState('近30天');

  const volumeData = useMemo(() => generateVolumeTrend(), [selectedBrand, timeRange]);
  const sentimentData = useMemo(() => generateSentimentData(), [selectedBrand]);
  const hotTopics = useMemo(() => generateHotTopics(), [selectedBrand, timeRange]);
  const competitorData = useMemo(() => generateCompetitorData(), [timeRange]);

  const totalVolume = volumeData.reduce((s, d) => s + d.vivo + d.iqoo + d.huawei + d.xiaomi, 0);

  // KPI Summary for selected brand
  const brandSummary = competitorData.find((b) => b.brand === selectedBrand) || competitorData[0];

  const chartConfig = {
    vivo: { label: 'vivo', color: '#4158D0' },
    iqoo: { label: 'iQOO', color: '#FF6B35' },
    huawei: { label: '华为', color: '#EF4444' },
    xiaomi: { label: '小米', color: '#F59E0B' },
  };

  const sentimentChartConfig = sentimentData.reduce((acc: Record<string, any>, d) => {
    acc[d.name] = { label: d.name, color: d.color };
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">品牌</span>
              <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRANDS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">时间</span>
              <Select value={timeRange} onValueChange={setTimeRange}>
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
            <div className="text-xs text-muted-foreground">
              数据更新于 {new Date().toLocaleDateString('zh-CN')}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border overflow-hidden relative">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">总声量</p>
                <p className="text-2xl font-bold text-foreground">
                  {(brandSummary.totalVolume / 10000).toFixed(1)}万
                </p>
                <div
                  className={cn(
                    'flex items-center gap-1 text-xs font-medium',
                    brandSummary.change >= 0 ? 'text-emerald-400' : 'text-red-400',
                  )}
                >
                  {brandSummary.change >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {brandSummary.change >= 0 ? '+' : ''}{brandSummary.change}%
                  <span className="text-muted-foreground ml-1">环比</span>
                </div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4158D0]/20 text-[#4158D0]">
                <MessageCircle className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border overflow-hidden relative">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">正面声量占比</p>
                <p className="text-2xl font-bold text-emerald-400">
                  {brandSummary.positiveRate}%
                </p>
                <div className="text-xs text-muted-foreground">
                  情感倾向：偏正面
                </div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                <ThumbsUp className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border overflow-hidden relative">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">平均互动率</p>
                <p className="text-2xl font-bold text-[#C850C0]">
                  {brandSummary.engagement}%
                </p>
                <div className="text-xs text-muted-foreground">
                  高于行业平均
                </div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#C850C0]/20 text-[#C850C0]">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border overflow-hidden relative">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">热门话题</p>
                <p className="text-2xl font-bold text-amber-400">
                  {hotTopics.length}
                </p>
                <div className="text-xs text-muted-foreground">
                  个上榜话题
                </div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                <Hash className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Volume Trend + Sentiment */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Volume Trend */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="pb-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              声量趋势
            </CardTitle>
            <CardDescription>近30天各品牌声量变化</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[320px]">
              <ChartContainer config={chartConfig} className="h-full">
                <AreaChart data={volumeData}>
                  <defs>
                    <linearGradient id="vivoGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4158D0" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#4158D0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line
                    type="monotone"
                    dataKey="vivo"
                    name="vivo"
                    stroke="#4158D0"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="iqoo"
                    name="iQOO"
                    stroke="#FF6B35"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="huawei"
                    name="华为"
                    stroke="#EF4444"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="xiaomi"
                    name="小米"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>

        {/* Sentiment Analysis */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-primary" />
              情感分析
            </CardTitle>
            <CardDescription>{selectedBrand} 品牌声量情感分布</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[220px]">
              <ChartContainer config={sentimentChartConfig} className="h-full">
                <PieChart>
                  <Pie
                    data={sentimentData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {sentimentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            </div>
            <div className="space-y-2 mt-2">
              {sentimentData.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm text-foreground">{item.name}</span>
                  </div>
                  <span className="text-sm font-mono tabular-nums text-foreground">
                    {item.value}%
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Hot Topics + Competitor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hot Topics */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Hash className="h-4 w-4 text-primary" />
              热门话题 TOP5
            </CardTitle>
            <CardDescription>与{selectedBrand}相关的热门讨论话题</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {hotTopics.map((topic) => (
                <div
                  key={topic.rank}
                  className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors"
                >
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold',
                      topic.rank <= 3
                        ? 'bg-gradient-to-br from-[#4158D0] to-[#C850C0] text-white'
                        : 'bg-secondary text-muted-foreground',
                    )}
                  >
                    {topic.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">{topic.topic}</div>
                    <div className="text-xs text-muted-foreground">
                      声量 {topic.volume.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={cn(
                        'text-xs font-medium flex items-center justify-end gap-0.5',
                        topic.trend >= 0 ? 'text-emerald-400' : 'text-red-400',
                      )}
                    >
                      {topic.trend >= 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {topic.trend >= 0 ? '+' : ''}{topic.trend}%
                    </div>
                    <SentimentBadge sentiment={topic.sentiment} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Competitor Comparison */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              竞品声量对比
            </CardTitle>
            <CardDescription>主要品牌总声量对比</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[280px]">
              <ChartContainer
                config={competitorData.reduce((acc: Record<string, any>, d) => {
                  acc[d.brand] = { label: d.brand, color: d.color };
                  return acc;
                }, {})}
                className="h-full"
              >
                <BarChart data={competitorData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={true} vertical={false} />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis
                    dataKey="brand"
                    type="category"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    width={50}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="totalVolume" name="总声量" radius={[0, 4, 4, 0]}>
                    {competitorData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </div>

            {/* Detail Table */}
            <div className="mt-4 space-y-2">
              {competitorData.slice(0, 4).map((brand) => (
                <div
                  key={brand.brand}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: brand.color }}
                    />
                    <span className="text-foreground">{brand.brand}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-muted-foreground">
                      {(brand.totalVolume / 10000).toFixed(1)}万
                    </span>
                    <span className="text-emerald-400">
                      正面{brand.positiveRate}%
                    </span>
                    <span
                      className={cn(
                        'font-mono',
                        brand.change >= 0 ? 'text-emerald-400' : 'text-red-400',
                      )}
                    >
                      {brand.change >= 0 ? '+' : ''}{brand.change}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
