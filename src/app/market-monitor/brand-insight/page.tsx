'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import {
  TrendingUp,
  RefreshCw,
  Plus,
  Play,
  CheckCircle,
  AlertCircle,
  Clock,
  Eye,
  Trash2,
  Download,
  Store,
  Megaphone,
  ChevronRight,
  Package,
  DollarSign,
  Layers,
  Gauge,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ============================================================
 * Types
 * ============================================================ */

type CategoryTree = Record<string, Record<string, string[]>>;

interface CrawlerResult {
  headers?: string[];
  rows?: Record<string, unknown>[];
  data?: unknown[][];
  rawText?: string;
  sheetName?: string;
}

interface CrawlerResponse {
  success: boolean;
  data?: CrawlerResult;
  cached?: boolean;
  error?: string;
}

interface EcomFilters {
  industry: string;
  l2: string;
  l3: string; // '' 表示该二级下全部三级
  brand: string; // '' 表示全部品牌
}

type EcomSubView = 'trend' | 'brand' | 'price';

/* ---- 社媒声量 ---- */
type BrandTaskStatus = 'pending' | 'running' | 'completed' | 'failed';

interface BrandTaskRecord {
  id: string;
  task_name: string;
  brand_name: string;
  industry: string | null;
  category: string | null;
  brief_session_id: number | null;
  biz_no: string | null;
  brief_text: string | null;
  brief_keyword: string | null;
  brief_password: string | null;
  source_codes: string | null;
  content_modes: string | null;
  start_time: string | null;
  end_time: string | null;
  status: BrandTaskStatus;
  mcp_status: number | string | null;
  mcp_status_desc: string | null;
  result_data: unknown;
  file_url: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/* ============================================================
 * Constants
 * ============================================================ */

const VOICE_SOURCES: { code: string; label: string }[] = [
  { code: '1', label: '新闻' },
  { code: '2', label: '论坛' },
  { code: '3', label: '小红书' },
  { code: '4', label: '抖音' },
  { code: '5', label: '微信公众号' },
  { code: '6', label: '微信视频号' },
  { code: '7', label: '快手' },
  { code: '8', label: 'B站' },
  { code: '9', label: '知乎' },
  { code: '10', label: '微博' },
];

const CONTENT_MODES = [
  { value: 'PGC', label: 'PGC（专业内容）' },
  { value: 'UGC', label: 'UGC（用户内容）' },
  { value: 'ALL', label: '全部' },
];

const CHART_COLORS = [
  '#4158D0',
  '#FF6B35',
  '#FF4D4F',
  '#FAAD14',
  '#52C41A',
  '#1890FF',
  '#722ED1',
  '#13C2C2',
  '#EB2F96',
  '#A0D911',
];

/* ============================================================
 * Helpers: 行数据归一化（crawler 返回中文字段）
 * ============================================================ */

/** 把任意值转为数字；兼容 "1,234.56"、"123万"、"12%" 等 */
function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.trim().replace(/,/g, '').replace(/\s/g, '');
  if (!s) return null;
  let multi = 1;
  if (s.endsWith('万')) {
    multi = 10000;
    s = s.slice(0, -1);
  } else if (s.endsWith('亿')) {
    multi = 100000000;
    s = s.slice(0, -1);
  }
  const isPercent = s.endsWith('%');
  if (isPercent) s = s.slice(0, -1);
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return isPercent ? n : n * multi;
}

/** 带单位显示 */
function formatNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 100000000) return (n / 100000000).toFixed(digits) + '亿';
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(digits) + '万';
  return n.toLocaleString('zh-CN', { maximumFractionDigits: digits });
}

function formatMoney(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return '¥' + formatNum(n, digits);
}

function formatPercent(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

/** 从 headers 中按别名优先级找到列名 */
function pickKey(headers: string[] | undefined, aliases: string[]): string | null {
  if (!headers) return null;
  for (const a of aliases) {
    // 对于品牌列，使用负向前瞻排除包含排名、榜单等词的列
    if (a === '品牌') {
      const regex = /品牌(?!.*(排名|榜单|列表|店铺|商品|数量|总数|数))/i;
      const hit = headers.find((h) => h && regex.test(h));
      if (hit) return hit;
    } else {
      const hit = headers.find((h) => h && h.includes(a));
      if (hit) return hit;
    }
  }
  return null;
}

function getCell(row: Record<string, unknown>, key: string | null): unknown {
  if (!key) return undefined;
  return row[key];
}

/* ============================================================
 * 通用小组件
 * ============================================================ */

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <div className="w-24 shrink-0 text-muted-foreground">{label}</div>
      <div className="flex-1 text-foreground break-all">{value ?? '—'}</div>
    </div>
  );
}

function StatusBadge({
  status,
  desc,
}: {
  status: BrandTaskStatus;
  desc?: string | null;
}) {
  const cfg: Record<
    BrandTaskStatus,
    { label: string; cls: string; icon: React.ReactNode }
  > = {
    pending: {
      label: '等待中',
      cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      icon: <Clock className="h-3 w-3" />,
    },
    running: {
      label: '进行中',
      cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      icon: <Play className="h-3 w-3" />,
    },
    completed: {
      label: '已完成',
      cls: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
      icon: <CheckCircle className="h-3 w-3" />,
    },
    failed: {
      label: '异常',
      cls: 'bg-red-500/15 text-red-400 border-red-500/30',
      icon: <AlertCircle className="h-3 w-3" />,
    },
  };
  const c = cfg[status];
  return (
    <Badge variant="outline" className={cn('gap-1', c.cls)} title={desc || undefined}>
      {(status === 'running' || status === 'pending') && (
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      )}
      {c.icon}
      {c.label}
    </Badge>
  );
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  let json: ApiEnvelope<T>;
  try {
    json = (await res.json()) as ApiEnvelope<T>;
  } catch {
    throw new Error(`请求失败 (HTTP ${res.status})`);
  }
  if (!res.ok || !json.success) {
    throw new Error(json.error || `请求失败 (HTTP ${res.status})`);
  }
  return json.data as T;
}

function formatDate(value?: string | number | null): string {
  if (!value) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  const d = Number.isFinite(n) && String(n).length >= 10 ? new Date(n) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('zh-CN', { hour12: false });
}

/* ============================================================
 * 视角一：电商品牌表现
 * ============================================================ */

const ECOM_SUBVIEWS: { key: EcomSubView; label: string }[] = [
  { key: 'brand', label: '品牌排行' },
  { key: 'trend', label: '大盘趋势' },
  { key: 'price', label: '价格区间' },
];

interface BrandRow {
  name: string;
  sales: number | null;
  volume: number | null;
  salesYoy: number | null;
  volumeYoy: number | null;
  share: number | null;
  avgPrice: number | null;
  raw: Record<string, unknown>;
}

interface TrendPoint {
  period: string;
  sales: number | null;
  volume: number | null;
}

interface PriceBucket {
  range: string;
  sales: number | null;
  volume: number | null;
  ratio: number | null;
}

/** 从 crawler 品牌列表行数组中抽取标准字段 */
function parseBrandRows(result: CrawlerResult | undefined): BrandRow[] {
  if (!result?.rows?.length) return [];
  const headers = result.headers;
  const kName = pickKey(headers, ['品牌', '品牌名称', '名称']);
  const kSales = pickKey(headers, ['销售额(万元)', '销售额（万元）', '销售额']);
  const kVolume = pickKey(headers, ['销量']);
  const kSalesYoy = pickKey(headers, ['销售额同比', '销售额同比增长率']);
  const kVolumeYoy = pickKey(headers, ['销量同比', '销量同比增长率']);
  const kShare = pickKey(headers, ['市场份额', '销售额占比', '份额']);
  const kAvgPrice = pickKey(headers, ['均价', '客单价', '平均价格']);

  // 销售额若是"万元"单位则需要 ×10000；为了避免歧义，统一以"元"展示，所以这里乘以万
  // 但如果列名不含"万元"，则不再乘。
  const salesIsWan = !!kSales && (kSales.includes('万元') || kSales.includes('（万元）'));

  return result.rows
    .map((row) => {
      // 先尝试匹配到的列名，没有匹配时尝试 row['品牌'] 和 row['品牌名']
      let name = String(getCell(row, kName) ?? '').trim();
      if (!name) {
        name = String(row['品牌'] ?? '').trim();
      }
      if (!name) {
        name = String(row['品牌名'] ?? '').trim();
      }
      if (!name) return null;
      const salesRaw = toNum(getCell(row, kSales));
      const sales = salesRaw == null ? null : salesIsWan ? salesRaw * 10000 : salesRaw;
      const volume = toNum(getCell(row, kVolume));
      const salesYoy = toNum(getCell(row, kSalesYoy));
      const volumeYoy = toNum(getCell(row, kVolumeYoy));
      const share = toNum(getCell(row, kShare));
      const avgPrice = toNum(getCell(row, kAvgPrice));
      return {
        name,
        sales,
        volume,
        salesYoy,
        volumeYoy,
        share,
        avgPrice,
        raw: row,
      } as BrandRow;
    })
    .filter((r): r is BrandRow => r !== null);
}

/** 从大盘趋势结果中抽取 13 个月序列 */
function parseTrend(result: CrawlerResult | undefined): TrendPoint[] {
  if (!result?.rows?.length) return [];
  const headers = result.headers;
  const kPeriod =
    pickKey(headers, ['月份', '日期', '时间', '周期', '统计月份']) ||
    (headers && headers[0]) ||
    null;
  const kSales = pickKey(headers, ['销售额(万元)', '销售额（万元）', '销售额']);
  const kVolume = pickKey(headers, ['销量']);
  const salesIsWan = !!kSales && kSales.includes('万');

  return result.rows
    .map((row) => {
      const period = String(getCell(row, kPeriod) ?? '').trim();
      if (!period) return null;
      const salesRaw = toNum(getCell(row, kSales));
      const sales = salesRaw == null ? null : salesIsWan ? salesRaw * 10000 : salesRaw;
      const volume = toNum(getCell(row, kVolume));
      return { period, sales, volume } as TrendPoint;
    })
    .filter((p): p is TrendPoint => p !== null);
}

/** 价格区间 */
function parsePriceBuckets(result: CrawlerResult | undefined): PriceBucket[] {
  if (!result?.rows?.length) return [];
  const headers = result.headers;
  const kRange =
    pickKey(headers, ['价格区间', '价格带', '区间']) ||
    (headers && headers[0]) ||
    null;
  const kSales = pickKey(headers, ['销售额(万元)', '销售额（万元）', '销售额']);
  const kVolume = pickKey(headers, ['销量', '商品数', '数量']);
  const kRatio = pickKey(headers, ['占比', '比例', '份额']);
  const salesIsWan = !!kSales && kSales.includes('万');

  return result.rows
    .map((row) => {
      const range = String(getCell(row, kRange) ?? '').trim();
      if (!range) return null;
      const salesRaw = toNum(getCell(row, kSales));
      const sales = salesRaw == null ? null : salesIsWan ? salesRaw * 10000 : salesRaw;
      const volume = toNum(getCell(row, kVolume));
      const ratio = toNum(getCell(row, kRatio));
      return { range, sales, volume, ratio } as PriceBucket;
    })
    .filter((p): p is PriceBucket => p !== null);
}

/* ---- 电商主面板 ---- */

function EcommercePanel() {
  const [tree, setTree] = useState<CategoryTree>({});
  const [treeLoading, setTreeLoading] = useState(true);

  const [filters, setFilters] = useState<EcomFilters>({
    industry: '',
    l2: '',
    l3: '',
    brand: '',
  });

  const [subView, setSubView] = useState<EcomSubView>('brand');

  // 三份数据（品牌列表 / 大盘趋势 / 价格区间）
  const [brandResult, setBrandResult] = useState<CrawlerResult | undefined>();
  const [trendResult, setTrendResult] = useState<CrawlerResult | undefined>();
  const [priceResult, setPriceResult] = useState<CrawlerResult | undefined>();

  const [loadingBrand, setLoadingBrand] = useState(false);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  /* 加载品类树 */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/market-monitor/categories');
        const json = await res.json();
        if (!cancelled && json?.success && json.data) {
          setTree(json.data as CategoryTree);
          const industries = Object.keys(json.data);
          const first = industries[0] || '';
          const l2List = first ? Object.keys(json.data[first] || {}) : [];
          setFilters({
            industry: first,
            l2: l2List[0] || '',
            l3: '',
            brand: '',
          });
        }
      } catch (e) {
        console.error('[brand-insight] load tree failed', e);
      } finally {
        if (!cancelled) setTreeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const l2List = useMemo(
    () => (filters.industry ? Object.keys(tree[filters.industry] || {}) : []),
    [tree, filters.industry],
  );
  const l3List = useMemo(
    () =>
      filters.industry && filters.l2
        ? tree[filters.industry]?.[filters.l2] || []
        : [],
    [tree, filters.industry, filters.l2],
  );

  const brandRows = useMemo(() => parseBrandRows(brandResult), [brandResult]);
  const trendPoints = useMemo(() => parseTrend(trendResult), [trendResult]);
  const priceBuckets = useMemo(() => parsePriceBuckets(priceResult), [priceResult]);

  // 品牌下拉来源：品牌列表
  const brandOptions = useMemo(() => {
    const names = brandRows
      .map((r) => r.name)
      .filter((n) => n && n !== '合计' && n !== '总计' && n !== '其他');
    return ['', ...Array.from(new Set(names))];
  }, [brandRows]);

  // 选中具体品牌时，过滤品牌排行；否则展示全部
  const visibleBrandRows = useMemo(() => {
    if (!filters.brand) return brandRows;
    return brandRows.filter((r) => r.name === filters.brand);
  }, [brandRows, filters.brand]);

  // KPI：基于品牌列表（全部品牌）计算
  const kpis = useMemo(() => {
    const totalSales = brandRows.reduce<number>(
      (s, r) => (r.sales != null ? s + r.sales : s),
      0,
    );
    const totalVolume = brandRows.reduce<number>(
      (s, r) => (r.volume != null ? s + r.volume : s),
      0,
    );
    const brandCount = brandRows.filter(
      (r) => r.name && r.name !== '合计' && r.name !== '总计',
    ).length;
    const avgPrice =
      totalVolume > 0 && totalSales > 0 ? totalSales / totalVolume : null;
    return { totalSales, totalVolume, brandCount, avgPrice };
  }, [brandRows]);

  /* 拉取 crawler 数据：品牌列表是主数据，趋势 / 价格区间辅助 */
  const fetchAll = useCallback(
    async (f: EcomFilters) => {
      if (!f.industry || !f.l2) return;
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);

      const params = new URLSearchParams({
        l1: f.industry,
        l2: f.l2,
        l3: f.l3 || '',
      });

      const baseUrl = '/api/market-monitor/brand/crawler';

      // 并发拉取三份视角
      setLoadingBrand(true);
      setLoadingTrend(true);
      setLoadingPrice(true);

      const tasks: Promise<void>[] = [
        fetch(
          `${baseUrl}?${params.toString()}&view=${encodeURIComponent('品牌列表')}`,
          { signal: controller.signal },
        )
          .then((r) => r.json() as Promise<CrawlerResponse>)
          .then((j) => {
            if (j.success) setBrandResult(j.data);
            else throw new Error(j.error || '品牌列表加载失败');
          })
          .catch((e) => {
            if (e?.name !== 'AbortError') {
              console.warn('[brand]', e);
              setBrandResult(undefined);
            }
          })
          .finally(() => setLoadingBrand(false)),

        fetch(
          `${baseUrl}?${params.toString()}&view=${encodeURIComponent('品类视角-大盘趋势')}`,
          { signal: controller.signal },
        )
          .then((r) => r.json() as Promise<CrawlerResponse>)
          .then((j) => {
            if (j.success) setTrendResult(j.data);
            else throw new Error(j.error || '大盘趋势加载失败');
          })
          .catch((e) => {
            // 趋势失败不阻断整体
            if (e?.name !== 'AbortError') {
              console.warn('[trend]', e);
              setTrendResult(undefined);
            }
          })
          .finally(() => setLoadingTrend(false)),

        fetch(
          `${baseUrl}?${params.toString()}&view=${encodeURIComponent('价格区间')}`,
          { signal: controller.signal },
        )
          .then((r) => r.json() as Promise<CrawlerResponse>)
          .then((j) => {
            if (j.success) setPriceResult(j.data);
            else throw new Error(j.error || '价格区间加载失败');
          })
          .catch((e) => {
            if (e?.name !== 'AbortError') {
              console.warn('[price]', e);
              setPriceResult(undefined);
            }
          })
          .finally(() => setLoadingPrice(false)),
      ];

      try {
        await Promise.all(tasks);
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : '数据加载失败');
      }
    },
    [],
  );

  // 三级联动变化时重新拉取（品牌变化不触发重新拉取，只做前端过滤）
  useEffect(() => {
    if (!filters.industry || !filters.l2) return;
    fetchAll(filters);
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.industry, filters.l2, filters.l3]);

  // 品牌下拉可能在 brandRows 加载完成后才确定，自动同步：若当前 brand 不在列表则置空
  useEffect(() => {
    if (filters.brand && !brandOptions.includes(filters.brand)) {
      setFilters((p) => ({ ...p, brand: '' }));
    }
  }, [brandOptions, filters.brand]);

  const handleIndustry = (v: string) => {
    const l2Arr = Object.keys(tree[v] || {});
    setFilters({ industry: v, l2: l2Arr[0] || '', l3: '', brand: '' });
  };
  const handleL2 = (v: string) => {
    setFilters((p) => ({ ...p, l2: v, l3: '', brand: '' }));
  };
  const handleL3 = (v: string) => {
    setFilters((p) => ({ ...p, l3: v, brand: '' }));
  };
  const handleBrand = (v: string) => {
    setFilters((p) => ({ ...p, brand: v }));
  };

  const anyLoading = loadingBrand || loadingTrend || loadingPrice;

  if (treeLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-lg" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[400px] w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 筛选器 */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">行业</span>
              <Select value={filters.industry} onValueChange={handleIndustry}>
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue placeholder="选择行业" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(tree).map((ind) => (
                    <SelectItem key={ind} value={ind}>
                      {ind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">二级品类</span>
              <Select value={filters.l2} onValueChange={handleL2}>
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue placeholder="选择品类" />
                </SelectTrigger>
                <SelectContent>
                  {l2List.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">三级品类</span>
              <Select value={filters.l3 || '__ALL__'} onValueChange={(v) => handleL3(v === '__ALL__' ? '' : v)}>
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">全部</SelectItem>
                  {l3List.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">品牌</span>
              <Select
                value={filters.brand || '__ALL__'}
                onValueChange={(v) => handleBrand(v === '__ALL__' ? '' : v)}
                disabled={loadingBrand || brandOptions.length === 0}
              >
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue
                    placeholder={loadingBrand ? '加载中…' : '全部品牌'}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">全部品牌</SelectItem>
                  {brandOptions
                    .filter((b) => b !== '')
                    .map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1" />

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchAll(filters)}
              disabled={anyLoading}
            >
              <RefreshCw
                className={cn('h-4 w-4 mr-1', anyLoading && 'animate-spin')}
              />
              刷新
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="总销售额"
          value={formatMoney(kpis.totalSales)}
          icon={<DollarSign className="h-4 w-4" />}
          loading={loadingBrand}
          accent="from-[#4158D0] to-[#4361EE]"
        />
        <KpiCard
          label="总销量"
          value={formatNum(kpis.totalVolume, 0)}
          icon={<Package className="h-4 w-4" />}
          loading={loadingBrand}
          accent="from-[#FF6B35] to-[#FF8F5E]"
        />
        <KpiCard
          label="品牌数"
          value={String(kpis.brandCount)}
          icon={<Layers className="h-4 w-4" />}
          loading={loadingBrand}
          accent="from-[#52C41A] to-[#95DE64]"
        />
        <KpiCard
          label="均价"
          value={formatMoney(kpis.avgPrice)}
          icon={<Gauge className="h-4 w-4" />}
          loading={loadingBrand}
          accent="from-[#722ED1] to-[#B37FEB]"
        />
      </div>

      {error && (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardContent className="py-3 text-sm text-red-400">
            {error}
          </CardContent>
        </Card>
      )}

      {/* 数据视角 */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              电商品牌表现
              <span className="text-xs text-muted-foreground font-normal ml-2">
                数据来源：crawler-server（近 13 个月）
              </span>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-1.5 mb-6 pb-4 border-b border-border">
            {ECOM_SUBVIEWS.map((v) => {
              const isLoading =
                (v.key === 'brand' && loadingBrand) ||
                (v.key === 'trend' && loadingTrend) ||
                (v.key === 'price' && loadingPrice);
              return (
                <Button
                  key={v.key}
                  variant={subView === v.key ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setSubView(v.key)}
                  className={cn(
                    subView === v.key &&
                      'bg-gradient-to-r from-[#4158D0] to-[#C850C0] text-white border-0',
                  )}
                >
                  {v.label}
                  {isLoading && <Spinner className="ml-1.5 h-3 w-3" />}
                </Button>
              );
            })}
          </div>

          {subView === 'brand' && (
            <BrandRankingView
              loading={loadingBrand}
              rows={visibleBrandRows}
              allRows={brandRows}
            />
          )}
          {subView === 'trend' && (
            <TrendView
              loading={loadingTrend}
              points={trendPoints}
              brand={filters.brand}
            />
          )}
          {subView === 'price' && (
            <PriceView loading={loadingPrice} buckets={priceBuckets} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  loading,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  loading?: boolean;
  accent: string;
}) {
  return (
    <Card className="bg-card border-border overflow-hidden relative">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div
            className={cn(
              'h-7 w-7 rounded-md flex items-center justify-center text-white bg-gradient-to-br',
              accent,
            )}
          >
            {icon}
          </div>
        </div>
        <div className="mt-3 text-2xl font-bold">
          {loading ? <Skeleton className="h-7 w-28" /> : value}
        </div>
      </CardContent>
    </Card>
  );
}

function BrandRankingView({
  loading,
  rows,
  allRows,
}: {
  loading: boolean;
  rows: BrandRow[];
  allRows: BrandRow[];
}) {
  if (loading) {
    return <Skeleton className="h-[360px] w-full rounded-lg" />;
  }
  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        暂无品牌数据
      </div>
    );
  }
  const totalSalesAll = allRows.reduce<number>(
    (s, r) => (r.sales != null ? s + r.sales : s),
    0,
  );

  // 按销售额降序
  const sorted = [...rows].sort((a, b) => {
    const s1 = a.sales ?? -1;
    const s2 = b.sales ?? -1;
    return s2 - s1;
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12">#</TableHead>
              <TableHead>品牌</TableHead>
              <TableHead className="text-right">销售额</TableHead>
              <TableHead className="text-right">销量</TableHead>
              <TableHead className="text-right">均价</TableHead>
              <TableHead className="text-right">市场份额</TableHead>
              <TableHead className="text-right">销售额同比</TableHead>
              <TableHead className="text-right">销量同比</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r, i) => {
              const share =
                r.share != null
                  ? r.share
                  : totalSalesAll > 0 && r.sales != null
                  ? (r.sales / totalSalesAll) * 100
                  : null;
              const avg =
                r.avgPrice != null
                  ? r.avgPrice
                  : r.sales != null && r.volume != null && r.volume > 0
                  ? r.sales / r.volume
                  : null;
              return (
                <TableRow key={r.name + i}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatMoney(r.sales)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatNum(r.volume, 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatMoney(avg)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {share != null ? share.toFixed(2) + '%' : '—'}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-mono tabular-nums',
                      r.salesYoy != null && r.salesYoy >= 0
                        ? 'text-emerald-400'
                        : 'text-red-400',
                    )}
                  >
                    {r.salesYoy != null ? (
                      <span className="inline-flex items-center gap-0.5">
                        {r.salesYoy >= 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : null}
                        {formatPercent(r.salesYoy)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-mono tabular-nums',
                      r.volumeYoy != null && r.volumeYoy >= 0
                        ? 'text-emerald-400'
                        : 'text-red-400',
                    )}
                  >
                    {formatPercent(r.volumeYoy)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function TrendView({
  loading,
  points,
  brand,
}: {
  loading: boolean;
  points: TrendPoint[];
  brand: string;
}) {
  const chartConfig = {
    sales: { label: '销售额（元）', color: '#4158D0' },
    volume: { label: '销量', color: '#FF6B35' },
  };
  if (loading) {
    return <Skeleton className="h-[380px] w-full rounded-lg" />;
  }
  if (points.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        暂无趋势数据
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {brand ? `品牌「${brand}」` : '所选品类'} 近 {points.length} 个月销售趋势
      </div>
      <div className="h-[380px]">
        <ChartContainer config={chartConfig} className="h-full w-full">
          <LineChart data={points} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="period"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis
              yAxisId="left"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickFormatter={(v) => formatNum(Number(v), 1)}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickFormatter={(v) => formatNum(Number(v), 1)}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="sales"
              name="销售额"
              stroke="#4158D0"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="volume"
              name="销量"
              stroke="#FF6B35"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ChartContainer>
      </div>
    </div>
  );
}

function PriceView({
  loading,
  buckets,
}: {
  loading: boolean;
  buckets: PriceBucket[];
}) {
  const chartConfig = {
    sales: { label: '销售额（元）', color: '#4158D0' },
  };
  if (loading) {
    return <Skeleton className="h-[380px] w-full rounded-lg" />;
  }
  if (buckets.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        暂无价格区间数据
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">价格带销售额分布</div>
      <div className="h-[380px]">
        <ChartContainer config={chartConfig} className="h-full w-full">
          <BarChart data={buckets} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="range"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickFormatter={(v) => formatNum(Number(v), 1)}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="sales" name="销售额" fill="#4158D0" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}

/* ============================================================
 * 视角二：社媒品牌声量（异步任务）
 * ============================================================ */

function sourceCodeLabels(codes?: string | null): string[] {
  if (!codes) return [];
  return codes
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => VOICE_SOURCES.find((s) => s.code === c)?.label || c);
}

function VoicePanel() {
  const [tree, setTree] = useState<CategoryTree>({});
  const [treeLoading, setTreeLoading] = useState(true);

  const [tasks, setTasks] = useState<BrandTaskRecord[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);

  // Step 1 form
  const [taskName, setTaskName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [industry, setIndustry] = useState('');
  const [l2, setL2] = useState('');
  const [briefDesc, setBriefDesc] = useState('');
  const [submittingBrief, setSubmittingBrief] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);

  // Step 1 brief 解析轮询
  const [briefPolling, setBriefPolling] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const briefPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 2 form
  const [briefKeyword, setBriefKeyword] = useState('');
  const [briefPassword, setBriefPassword] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sources, setSources] = useState<string[]>(['3', '4', '10']);
  const [contentMode, setContentMode] = useState('ALL');
  const [submittingTask, setSubmittingTask] = useState(false);

  // 详情
  const [detailTask, setDetailTask] = useState<BrandTaskRecord | null>(null);

  // 任务轮询
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  /* 加载品类树 */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/market-monitor/categories');
        const json = await res.json();
        if (!cancelled && json?.success && json.data) {
          setTree(json.data as CategoryTree);
          const first = Object.keys(json.data)[0] || '';
          setIndustry(first);
          setL2(Object.keys(json.data[first] || {})[0] || '');
        }
      } finally {
        if (!cancelled) setTreeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const data = await apiFetch<BrandTaskRecord[]>(
        '/api/market-monitor/brand/voice/tasks',
      );
      setTasks(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[loadTasks]', e);
      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  /* 自动轮询 pending/running 任务 */
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollCountRef.current = 0;

    const active = tasks.filter(
      (t) =>
        t.status === 'running' ||
        (t.status === 'pending' && !t.biz_no),
    );
    if (active.length === 0) return;

    pollRef.current = setInterval(async () => {
      pollCountRef.current += 1;
      if (pollCountRef.current > 60) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        return;
      }

      const updates = await Promise.all(
        active.map(async (task) => {
          try {
            if (task.status === 'pending' && !task.biz_no) {
              const d = await apiFetch<{
                status: string;
                briefKeyword?: string | null;
                briefPassword?: string | null;
                task: BrandTaskRecord;
              }>(
                `/api/market-monitor/brand/voice/brief-result?taskId=${task.id}`,
              );
              return d.task;
            }
            return await apiFetch<BrandTaskRecord>(
              `/api/market-monitor/brand/voice/task-result?taskId=${task.id}`,
            );
          } catch (e) {
            console.error('[poll]', e);
            return null;
          }
        }),
      );

      setTasks((prev) => {
        const map = new Map(prev.map((t) => [t.id, t]));
        for (const u of updates) {
          if (u) map.set(u.id, u);
        }
        return Array.from(map.values());
      });

      setDetailTask((prev) => {
        if (!prev) return prev;
        const found = updates.find(
          (u): u is BrandTaskRecord => !!u && u.id === prev.id,
        );
        return found || prev;
      });

      const stillActive = updates.some(
        (u) =>
          u &&
          (u.status === 'running' ||
            (u.status === 'pending' && !u.biz_no)),
      );
      if (!stillActive && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 8000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [tasks]);

  useEffect(() => {
    return () => {
      if (briefPollRef.current) clearInterval(briefPollRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const l2Options = useMemo(
    () => (industry ? Object.keys(tree[industry] || {}) : []),
    [tree, industry],
  );

  const stats = useMemo(() => {
    return {
      total: tasks.length,
      running: tasks.filter((t) => t.status === 'running').length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
    };
  }, [tasks]);

  const resetForm = () => {
    setWizardStep(1);
    setTaskName('');
    setBrandName('');
    setBriefDesc('');
    setSubmittingBrief(false);
    setCurrentTaskId(null);
    setBriefPolling(false);
    setBriefError(null);
    setBriefKeyword('');
    setBriefPassword('');
    setStartDate('');
    setEndDate('');
    setSources(['3', '4', '10']);
    setContentMode('ALL');
    if (briefPollRef.current) {
      clearInterval(briefPollRef.current);
      briefPollRef.current = null;
    }
  };

  const openDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  /* Step 1：提交 brief */
  const handleSubmitBrief = async () => {
    const name = taskName.trim();
    const brand = brandName.trim();
    const desc = briefDesc.trim();
    if (!name) return alert('请输入任务名称');
    if (!brand) return alert('请输入品牌名');
    if (!desc) return alert('请输入分析诉求描述');

    const brief = `品牌：${brand}\n所属行业：${industry} / ${l2}\n分析诉求：${desc}`;

    setSubmittingBrief(true);
    setBriefError(null);
    try {
      const data = await apiFetch<BrandTaskRecord & { briefSessionId?: number }>(
        '/api/market-monitor/brand/voice/submit-brief',
        {
          method: 'POST',
          body: JSON.stringify({
            taskName: name,
            brandName: brand,
            industry,
            category: l2,
            brief,
          }),
        },
      );
      setCurrentTaskId(data.id);
      setTasks((prev) => [data, ...prev]);
      setBriefPolling(true);

      let count = 0;
      const max = 30;
      const poll = async () => {
        count += 1;
        if (count > max) {
          setBriefPolling(false);
          setBriefError('AI 解析超时，请稍后在任务列表中查看或重试');
          if (briefPollRef.current) {
            clearInterval(briefPollRef.current);
            briefPollRef.current = null;
          }
          return;
        }
        try {
          const r = await apiFetch<{
            status: string;
            briefKeyword?: string | null;
            briefPassword?: string | null;
            task: BrandTaskRecord;
          }>(
            `/api/market-monitor/brand/voice/brief-result?taskId=${data.id}`,
          );
          setTasks((prev) =>
            prev.map((t) => (t.id === data.id ? r.task : t)),
          );
          if (r.status === 'COMPLETED') {
            setBriefKeyword(r.briefKeyword || '');
            setBriefPassword(r.briefPassword || '');
            setWizardStep(2);
            setBriefPolling(false);
            if (briefPollRef.current) {
              clearInterval(briefPollRef.current);
              briefPollRef.current = null;
            }
          } else if (r.status === 'FAILED' || r.status === 'ABORTED') {
            setBriefPolling(false);
            setBriefError('AI 解析失败，请调整描述后重试');
            if (briefPollRef.current) {
              clearInterval(briefPollRef.current);
              briefPollRef.current = null;
            }
          }
        } catch (e) {
          console.error('[brief poll]', e);
        }
      };
      briefPollRef.current = setInterval(poll, 3000);
    } catch (e) {
      alert(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmittingBrief(false);
    }
  };

  const toggleSource = (code: string) => {
    setSources((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  /* Step 2：提交采集任务 */
  const handleSubmitTask = async () => {
    if (!currentTaskId) return;
    if (!briefKeyword.trim()) return alert('关键词不能为空');
    if (!startDate || !endDate) return alert('请选择时间范围');
    if (sources.length === 0) return alert('请至少选择一个渠道');
    const startTs = new Date(startDate + 'T00:00:00').getTime();
    const endTs = new Date(endDate + 'T23:59:59').getTime();
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs))
      return alert('时间格式无效');
    if (endTs <= startTs) return alert('截止日期必须晚于起始日期');

    setSubmittingTask(true);
    try {
      const updated = await apiFetch<BrandTaskRecord>(
        '/api/market-monitor/brand/voice/submit-task',
        {
          method: 'POST',
          body: JSON.stringify({
            taskId: currentTaskId,
            startTime: String(startTs),
            endTime: String(endTs),
            sourceCodes: sources.slice().sort().join(','),
            contentModes: contentMode,
            briefKeyword: briefKeyword.trim(),
            briefPassword: briefPassword.trim() || undefined,
          }),
        },
      );
      setTasks((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t)),
      );
      setDialogOpen(false);
      resetForm();
    } catch (e) {
      alert(e instanceof Error ? e.message : '提交任务失败');
    } finally {
      setSubmittingTask(false);
    }
  };

  const handleDelete = async (task: BrandTaskRecord) => {
    if (!window.confirm(`确定要删除任务「${task.task_name}」吗？`)) return;
    try {
      await apiFetch('/api/market-monitor/brand/voice/delete-task', {
        method: 'POST',
        body: JSON.stringify({ taskId: task.id }),
      });
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      if (detailTask?.id === task.id) setDetailTask(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  };

  /* 渲染 */
  return (
    <div className="space-y-6">
      {/* 统计 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="全部任务" value={stats.total} />
        <StatCard label="等待中" value={stats.pending} accent="text-amber-400" />
        <StatCard label="进行中" value={stats.running} accent="text-emerald-400" />
        <StatCard label="已完成" value={stats.completed} accent="text-zinc-300" />
        <StatCard label="异常" value={stats.failed} accent="text-red-400" />
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-primary" />
                品牌声量分析任务
              </CardTitle>
              <CardDescription className="mt-1">
                覆盖新闻、论坛、小红书、抖音、公众号、视频号、快手、B站、知乎、微博 10 个渠道
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={openDialog}
              className="bg-gradient-to-r from-[#4158D0] to-[#C850C0] hover:opacity-90"
            >
              <Plus className="h-4 w-4 mr-1" />
              新建声量任务
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingTasks ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : tasks.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              暂无任务，点击右上角「新建声量任务」开始
            </div>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>任务名称</TableHead>
                    <TableHead>品牌</TableHead>
                    <TableHead>渠道</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium max-w-[260px] truncate">
                        {t.task_name}
                      </TableCell>
                      <TableCell>{t.brand_name}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {sourceCodeLabels(t.source_codes).slice(0, 4).map((s) => (
                            <Badge
                              key={s}
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {s}
                            </Badge>
                          ))}
                          {sourceCodeLabels(t.source_codes).length > 4 && (
                            <Badge variant="outline" className="text-[10px]">
                              +{sourceCodeLabels(t.source_codes).length - 4}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={t.status} desc={t.mcp_status_desc} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(t.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDetailTask(t)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDelete(t)}
                          >
                            <Trash2 className="h-4 w-4 text-red-400/70" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 新建任务向导 */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && briefPollRef.current) {
            clearInterval(briefPollRef.current);
            briefPollRef.current = null;
          }
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {wizardStep === 1 ? '新建品牌声量分析' : '确认采集范围'}
            </DialogTitle>
            <DialogDescription>
              {wizardStep === 1
                ? '填写品牌与分析诉求，AI 将自动生成关键词与排除词。'
                : '确认关键词、时间范围与渠道，提交后开始异步采集。'}
            </DialogDescription>
          </DialogHeader>

          {wizardStep === 1 && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>任务名称</Label>
                <Input
                  placeholder="例如：vivo 8月全网口碑分析"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>品牌名 *</Label>
                <Input
                  placeholder="例如：vivo"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>所属行业</Label>
                  <Select
                    value={industry}
                    onValueChange={(v) => {
                      setIndustry(v);
                      setL2(Object.keys(tree[v] || {})[0] || '');
                    }}
                    disabled={treeLoading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(tree).map((ind) => (
                        <SelectItem key={ind} value={ind}>
                          {ind}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>二级品类</Label>
                  <Select value={l2} onValueChange={setL2} disabled={treeLoading}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {l2Options.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>分析诉求 *</Label>
                <Textarea
                  rows={4}
                  placeholder="例如：分析该品牌近 30 天全网口碑和声量趋势，重点关注新品发布、负面舆情、竞品对比"
                  value={briefDesc}
                  onChange={(e) => setBriefDesc(e.target.value)}
                />
              </div>

              {briefError && (
                <div className="text-xs text-red-400">{briefError}</div>
              )}
              {briefPolling && (
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <Spinner className="h-3 w-3" />
                  AI 正在解析品牌关键词，请稍候...
                </div>
              )}
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>关键词（支持逗号/空格分隔，可编辑）</Label>
                <Textarea
                  rows={3}
                  value={briefKeyword}
                  onChange={(e) => setBriefKeyword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>排除词（可选）</Label>
                <Input
                  value={briefPassword}
                  onChange={(e) => setBriefPassword(e.target.value)}
                  placeholder="不想要的词，逗号分隔"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>开始日期</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>结束日期</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>声量类型</Label>
                <Select value={contentMode} onValueChange={setContentMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>渠道（已选 {sources.length}）</Label>
                <div className="grid grid-cols-2 gap-2">
                  {VOICE_SOURCES.map((s) => (
                    <label
                      key={s.code}
                      className="flex items-center gap-2 text-sm rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-accent/50"
                    >
                      <input
                        type="checkbox"
                        className="accent-[#4158D0]"
                        checked={sources.includes(s.code)}
                        onChange={() => toggleSource(s.code)}
                      />
                      <span>{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {wizardStep === 1 ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={submittingBrief}
                >
                  取消
                </Button>
                <Button
                  onClick={handleSubmitBrief}
                  disabled={submittingBrief || briefPolling}
                  className="bg-gradient-to-r from-[#4158D0] to-[#C850C0] hover:opacity-90"
                >
                  {submittingBrief || briefPolling ? (
                    <Spinner className="mr-1" />
                  ) : (
                    <ChevronRight className="h-4 w-4 mr-1" />
                  )}
                  解析关键词
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setWizardStep(1)}
                  disabled={submittingTask}
                >
                  上一步
                </Button>
                <Button
                  onClick={handleSubmitTask}
                  disabled={submittingTask}
                  className="bg-gradient-to-r from-[#4158D0] to-[#C850C0] hover:opacity-90"
                >
                  {submittingTask ? <Spinner className="mr-1" /> : null}
                  提交采集任务
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 详情弹窗 */}
      <Dialog
        open={!!detailTask}
        onOpenChange={(open) => !open && setDetailTask(null)}
      >
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto max-w-lg">
          {detailTask && (
            <>
              <DialogHeader>
                <DialogTitle>{detailTask.task_name}</DialogTitle>
                <DialogDescription>
                  品牌：{detailTask.brand_name} · 行业：
                  {detailTask.industry || '—'} / {detailTask.category || '—'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1 py-2">
                <InfoRow
                  label="状态"
                  value={
                    <StatusBadge
                      status={detailTask.status}
                      desc={detailTask.mcp_status_desc}
                    />
                  }
                />
                <InfoRow
                  label="创建时间"
                  value={formatDate(detailTask.created_at)}
                />
                <InfoRow
                  label="更新时间"
                  value={formatDate(detailTask.updated_at)}
                />
                {detailTask.brief_text && (
                  <InfoRow
                    label="分析诉求"
                    value={
                      <pre className="whitespace-pre-wrap font-sans text-sm">
                        {detailTask.brief_text}
                      </pre>
                    }
                  />
                )}
                {detailTask.brief_keyword && (
                  <InfoRow
                    label="关键词"
                    value={
                      <div className="flex flex-wrap gap-1">
                        {detailTask.brief_keyword
                          .split(/[,，\s]+/)
                          .filter(Boolean)
                          .map((k, i) => (
                            <Badge
                              key={i}
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {k}
                            </Badge>
                          ))}
                      </div>
                    }
                  />
                )}
                {detailTask.brief_password && (
                  <InfoRow
                    label="排除词"
                    value={
                      <div className="flex flex-wrap gap-1">
                        {detailTask.brief_password
                          .split(/[,，\s]+/)
                          .filter(Boolean)
                          .map((k, i) => (
                            <Badge
                              key={i}
                              variant="outline"
                              className="text-[10px]"
                            >
                              {k}
                            </Badge>
                          ))}
                      </div>
                    }
                  />
                )}
                <InfoRow
                  label="时间范围"
                  value={`${formatDate(detailTask.start_time)} ~ ${formatDate(
                    detailTask.end_time,
                  )}`}
                />
                <InfoRow
                  label="渠道"
                  value={
                    <div className="flex flex-wrap gap-1">
                      {sourceCodeLabels(detailTask.source_codes).map((s) => (
                        <Badge
                          key={s}
                          variant="secondary"
                          className="text-[10px]"
                        >
                          {s}
                        </Badge>
                      ))}
                    </div>
                  }
                />
                <InfoRow
                  label="声量类型"
                  value={detailTask.content_modes || '—'}
                />
                {detailTask.biz_no && (
                  <InfoRow label="业务编号" value={detailTask.biz_no} />
                )}
                {detailTask.mcp_status != null && (
                  <InfoRow
                    label="采集状态码"
                    value={String(detailTask.mcp_status)}
                  />
                )}

                {detailTask.file_url && (
                  <div className="pt-2">
                    <a
                      href={detailTask.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button size="sm" variant="outline">
                        <Download className="h-4 w-4 mr-1" />
                        下载声量报告
                      </Button>
                    </a>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn('mt-1 text-2xl font-bold', accent)}>{value}</div>
      </CardContent>
    </Card>
  );
}

/* ============================================================
 * Page
 * ============================================================ */

export default function BrandInsightPage() {
  const [tab, setTab] = useState<'ecom' | 'voice'>('ecom');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">品牌洞察</h1>
          <p className="text-sm text-muted-foreground mt-1">
            双视角品牌分析：电商品牌实时表现 + 全网声量异步洞察
          </p>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as 'ecom' | 'voice')}
      >
        <TabsList className="bg-muted">
          <TabsTrigger value="ecom" className="gap-1.5">
            <Store className="h-4 w-4" />
            电商表现
          </TabsTrigger>
          <TabsTrigger value="voice" className="gap-1.5">
            <Megaphone className="h-4 w-4" />
            社媒声量
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ecom" className="mt-6">
          <EcommercePanel />
        </TabsContent>
        <TabsContent value="voice" className="mt-6">
          <VoicePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
