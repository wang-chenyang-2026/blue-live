'use client';

/**
 * 品牌洞察 · 电商品牌表现 扩展视角
 *
 * 5 个额外视角（后端 /api/market-monitor/brand/crawler 已支持 8 视角，品牌洞察页此前只接了 3 个）：
 *   sales   销售价量   价格交叉同口径的 13 个月价量/同环比
 *   shop    店铺列表   月份 × 平台 × 店铺（数据量约 2600 行，取最新月 + 分页）
 *   product 商品列表   上游 MCP 数据源故障（500），显示降级态，接口恢复后自动可用
 *   cross   价格交叉   品牌 × 价位带 市占率矩阵（价位档按接口实际列名，动态识别）
 *   hotword 热词频次   平台 × 月份 × 热词（数据量约 7200 行，按总频次取 Top + 平台切换）
 *
 * 数据量大的视角不随品类切换预拉，改为首次切入该 Tab 时懒加载；缓存于组件 state。
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';

/* ---------------- 类型和工具 ---------------- */

interface CrawlerResult {
  headers?: string[];
  rows?: Record<string, unknown>[];
  [key: string]: unknown;
}

interface CrawlerApiResponse {
  success: boolean;
  data?: CrawlerResult;
  error?: string;
}

/** 按品牌/平台/月份区间过滤 crawler 行；字段缺失自动跳过 */
function filterRows(
  result: CrawlerResult | undefined,
  opts: { brand?: string; platform?: string; monthFrom?: string; monthTo?: string },
): CrawlerResult | undefined {
  if (!result?.rows?.length) return result;
  let rows = result.rows;
  if (opts.brand) {
    if (rows.some((r) => r['品牌'])) rows = rows.filter((r) => r['品牌'] === opts.brand);
  }
  if (opts.platform) {
    if (rows.some((r) => r['平台'])) rows = rows.filter((r) => !r['平台'] || String(r['平台']).toLowerCase() === opts.platform);
  }
  if (opts.monthFrom || opts.monthTo) {
    const f = opts.monthFrom ? Number(opts.monthFrom) : 0;
    const t = opts.monthTo ? Number(opts.monthTo) : 999999;
    const lo = Math.min(f, t);
    const hi = Math.max(f, t);
    rows = rows.filter((r) => {
      const m = Number(r['日期']);
      if (!m) return true;
      return m >= lo && m <= hi;
    });
  }
  return { ...result, rows };
}

export type ExtraViewKey = 'sales' | 'shop' | 'product' | 'cross' | 'hotword';

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[,，%\s]/g, '').replace(/万$/, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function pickKey(headers: string[] | undefined, aliases: string[]): string | null {
  if (!headers) return null;
  for (const a of aliases) {
    const hit = headers.find((h) => h && h.replace(/\s/g, '').includes(a.replace(/\s/g, '')));
    if (hit) return hit;
  }
  return null;
}

function cell(row: Record<string, unknown>, key: string | null): unknown {
  if (!key) return undefined;
  if (key in row) return row[key];
  const hit = Object.keys(row).find((k) => k.replace(/\s/g, '') === key.replace(/\s/g, ''));
  return hit ? row[hit] : undefined;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function formatPeriod(raw: string): string {
  const m = str(raw).match(/(\d{4})[-/]?(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  return str(raw);
}

function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${(n / 1e8).toFixed(2)} 亿`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(1)} 万`;
  return n.toLocaleString('zh-CN');
}

function formatVolume(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${(n / 1e8).toFixed(2)} 亿`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(1)} 万`;
  return n.toLocaleString('zh-CN');
}

function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

const PLATFORM_LABEL: Record<string, string> = {
  jd: '京东',
  tmall: '天猫',
  douyin: '抖音',
};

function platformLabel(p: string): string {
  const k = str(p).toLowerCase();
  return PLATFORM_LABEL[k] || str(p) || '—';
}

/* ---------------- 解析器 ---------------- */

interface SalesPoint {
  period: string;
  sales: number | null;
  volume: number | null;
  avgPrice: number | null;
  salesYoy: number | null;
  volumeYoy: number | null;
}

function parseSales(result: CrawlerResult | undefined): SalesPoint[] {
  if (!result?.rows?.length) return [];
  const h = result.headers;
  const kPeriod = pickKey(h, ['日期', '月份']) || h?.[0] || null;
  const kSales = pickKey(h, ['销售额(元)', '销售额']);
  const kVolume = pickKey(h, ['销量(件)', '销量']);
  const kAvg = pickKey(h, ['均价']);
  const kSalesYoy = pickKey(h, ['销售额同比']);
  const kVolumeYoy = pickKey(h, ['销量同比']);
  return result.rows
    .map((row) => {
      const period = formatPeriod(str(cell(row, kPeriod)));
      if (!period) return null;
      return {
        period,
        sales: toNum(cell(row, kSales)),
        volume: toNum(cell(row, kVolume)),
        avgPrice: toNum(cell(row, kAvg)),
        salesYoy: toNum(cell(row, kSalesYoy)),
        volumeYoy: toNum(cell(row, kVolumeYoy)),
      } as SalesPoint;
    })
    .filter((x): x is SalesPoint => x !== null)
    .sort((a, b) => a.period.localeCompare(b.period));
}

interface ShopRow {
  period: string;
  platform: string;
  name: string;
  sales: number | null;
  salesShare: number | null;
  salesYoy: number | null;
  volume: number | null;
  volumeShare: number | null;
  avgPrice: number | null;
}

function parseShops(result: CrawlerResult | undefined): ShopRow[] {
  if (!result?.rows?.length) return [];
  const h = result.headers;
  const kPeriod = pickKey(h, ['日期', '月份']) || h?.[0] || null;
  const kPlat = pickKey(h, ['平台']);
  const kName = pickKey(h, ['店铺']);
  const kSales = pickKey(h, ['销售额(元)', '销售额']);
  const kSalesShare = pickKey(h, ['销售额占比']);
  const kSalesYoy = pickKey(h, ['销售额同比']);
  const kVolume = pickKey(h, ['销量(件)', '销量']);
  const kVolumeShare = pickKey(h, ['销量占比']);
  const kAvg = pickKey(h, ['均价']);
  return result.rows
    .map((row) => {
      const name = str(cell(row, kName));
      if (!name) return null;
      return {
        period: formatPeriod(str(cell(row, kPeriod))),
        platform: platformLabel(str(cell(row, kPlat))),
        name,
        sales: toNum(cell(row, kSales)),
        salesShare: toNum(cell(row, kSalesShare)),
        salesYoy: toNum(cell(row, kSalesYoy)),
        volume: toNum(cell(row, kVolume)),
        volumeShare: toNum(cell(row, kVolumeShare)),
        avgPrice: toNum(cell(row, kAvg)),
      } as ShopRow;
    })
    .filter((x): x is ShopRow => x !== null);
}

interface CrossRow {
  brand: string;
  bandShare: number | null; // 品牌整体占比
  bands: { band: string; share: number | null }[]; // 各价位带 价格市占率
}

/**
 * 价格交叉：列名形如 "<1799" / "1799- 3553" / "> 6578" 为销量列，
 * 每档后面紧跟 "xxx价格占比(%)" 和 "xxx价格市占率(%)"。价位档名从列名动态识别，不硬编码。
 */
function parseCross(result: CrawlerResult | undefined): CrossRow[] {
  if (!result?.rows?.length || !result.headers) return [];
  const h = result.headers;
  const kBrand = pickKey(h, ['品牌']) || h.find((x) => x === '品牌') || null;
  const kBrandShare = pickKey(h, ['品牌占比']);

  // 识别价位档：找到所有「市占率」列，取其前缀作为价位档名
  const bands: string[] = [];
  const shareColByBand = new Map<string, string>();
  for (const col of h) {
    if (col.includes('市占率')) {
      // 价位档名 = 去掉"价格市占率(%)"等后缀
      const band = col.replace(/价格市占率.*$/i, '').replace(/市占率.*$/i, '').trim();
      if (band) {
        bands.push(band);
        shareColByBand.set(band, col);
      }
    }
  }
  if (bands.length === 0) return [];

  // 按品牌聚合（原始为月份 × 品牌）：市占率取各月均值
  const map = new Map<string, { brandShare: number[]; bandShares: Map<string, number[]> }>();
  for (const row of result.rows) {
    const brand = str(cell(row, kBrand));
    if (!brand || brand === '合计' || brand === '总计') continue;
    let g = map.get(brand);
    if (!g) {
      g = { brandShare: [], bandShares: new Map() };
      map.set(brand, g);
    }
    const bs = toNum(cell(row, kBrandShare));
    if (bs != null) g.brandShare.push(bs);
    for (const band of bands) {
      const v = toNum(row[shareColByBand.get(band)!]);
      if (v != null) {
        const arr = g.bandShares.get(band) || [];
        arr.push(v);
        g.bandShares.set(band, arr);
      }
    }
  }

  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;

  return Array.from(map.entries())
    .map(([brand, g]) => ({
      brand,
      bandShare: avg(g.brandShare),
      bands: bands.map((band) => ({ band, share: avg(g.bandShares.get(band) || []) })),
    }))
    .sort((a, b) => (b.bandShare ?? 0) - (a.bandShare ?? 0));
}

interface HotRow {
  word: string;
  count: number;       // 频次合计
  sales: number | null;
  yoy: number | null;
  premium: number | null;
}

function parseHotwords(result: CrawlerResult | undefined): { platforms: string[]; byPlatform: Record<string, HotRow[]> } {
  if (!result?.rows?.length) return { platforms: [], byPlatform: {} };
  const h = result.headers;
  const kPlat = pickKey(h, ['平台']);
  const kWord = pickKey(h, ['热词', '关键词']);
  const kCount = pickKey(h, ['频次', '次数']);
  const kSales = pickKey(h, ['销售额(元)', '销售额']);
  const kYoy = pickKey(h, ['销售额同比']);
  const kPremium = pickKey(h, ['溢价率']);

  // 平台 × 词 → 聚合
  const platWord = new Map<string, Map<string, { count: number; sales: number; yoy: number[]; premium: number[] }>>();
  const platforms: string[] = [];
  for (const row of result.rows) {
    const plat = platformLabel(str(cell(row, kPlat)));
    const word = str(cell(row, kWord));
    if (!word) continue;
    if (!platWord.has(plat)) {
      platWord.set(plat, new Map());
      platforms.push(plat);
    }
    const wm = platWord.get(plat)!;
    let agg = wm.get(word);
    if (!agg) {
      agg = { count: 0, sales: 0, yoy: [], premium: [] };
      wm.set(word, agg);
    }
    agg.count += toNum(cell(row, kCount)) ?? 0;
    agg.sales += toNum(cell(row, kSales)) ?? 0;
    const y = toNum(cell(row, kYoy));
    if (y != null) agg.yoy.push(y);
    const p = toNum(cell(row, kPremium));
    if (p != null) agg.premium.push(p);
  }

  const byPlatform: Record<string, HotRow[]> = {};
  for (const plat of platforms) {
    const rows: HotRow[] = Array.from(platWord.get(plat)!.entries())
      .map(([word, a]) => ({
        word,
        count: a.count,
        sales: a.sales || null,
        yoy: a.yoy.length ? a.yoy.reduce((s, x) => s + x, 0) / a.yoy.length : null,
        premium: a.premium.length ? a.premium.reduce((s, x) => s + x, 0) / a.premium.length : null,
      }))
      .sort((a, b) => b.count - a.count);
    byPlatform[plat] = rows;
  }
  return { platforms, byPlatform };
}

/* ---------------- 主组件 ---------------- */

const VIEW_LABEL: Record<ExtraViewKey, string> = {
  sales: '销售价量',
  shop: '店铺列表',
  product: '商品列表',
  cross: '价格交叉',
  hotword: '热词频次',
};

const VIEW_API: Record<ExtraViewKey, string> = {
  sales: '品类视角-销售价量',
  shop: '品类视角-店铺列表',
  product: '品类视角-商品列表',
  cross: '品类视角-价格交叉',
  hotword: '品类视角-热词频次',
};

const PAGE_SIZE = 15;
const HOT_TOP_N = 30;
const CROSS_TOP_N = 15;

export function EcomExtraViews({
  view,
  filters,
  monthFrom,
  monthTo,
  brand,
  platform,
}: {
  view: ExtraViewKey;
  filters: { industry: string; l2: string; l3: string };
  monthFrom?: string;
  monthTo?: string;
  brand?: string;
  platform?: string;
}) {
  const [rawResult, setRawResult] = useState<CrawlerResult | undefined>();
  const result = useMemo(
    () => filterRows(rawResult, { brand, platform, monthFrom, monthTo }),
    [rawResult, brand, platform, monthFrom, monthTo],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  const fkey = `${filters.industry}|${filters.l2}|${filters.l3}`;

  const fetchView = useCallback(async () => {
    if (!filters.industry || !filters.l2) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    setRawResult(undefined);
    try {
      const params = new URLSearchParams({
        l1: filters.industry,
        l2: filters.l2,
        l3: filters.l3 || '',
        view: VIEW_API[view],
      });
      const res = await fetch(
        `/api/market-monitor/brand/crawler?${params.toString()}`,
        { signal: ctrl.signal },
      );
      const j = (await res.json()) as CrawlerApiResponse;
      if (ctrl.signal.aborted) return;
      if (j.success) {
        setRawResult(j.data);
      } else {
        setError(j.error || '数据加载失败');
      }
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : '数据加载失败');
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [view, filters.industry, filters.l2, filters.l3]);

  // 视角或品类变化时，若未加载过则懒加载
  useEffect(() => {
    const needKey = `${view}|${fkey}`;
    if (needKey !== loadedKey) {
      setLoadedKey(needKey);
      fetchView();
    }
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, fkey]);

  if (loading) return <LoadingSkeleton view={view} />;

  if (error) {
    const isProduct = view === 'product';
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6 text-sm">
        <div className="font-medium text-amber-600 dark:text-amber-400">
          {isProduct ? '「商品列表」数据暂不可用' : '数据加载失败'}
        </div>
        <div className="mt-1.5 text-muted-foreground">
          {isProduct
            ? '该细分品类的「商品列表」上游数据异常（久谦 MCP 返回 500，需供应商修复）；可将三级品类切为「全部」查看全品类商品，或先查看品牌排行、店铺列表。接口恢复后此处将自动展示数据。'
            : error}
        </div>
      </div>
    );
  }

  if (!result) return <LoadingSkeleton view={view} />;

  // 维度不生效提示
  const noPlatformViews: ExtraViewKey[] = ['sales', 'cross'];
  const noBrandViews: ExtraViewKey[] = ['sales', 'shop', 'hotword'];
  const showPlatformHint = platform && noPlatformViews.includes(view);
  const showBrandHint = brand && noBrandViews.includes(view);
  const PLAT_LABEL: Record<string, string> = { jd: '京东', tmall: '天猫', douyin: '抖音' };

  const hint = (showPlatformHint || showBrandHint) ? (
    <div className="text-xs text-muted-foreground mb-2">
      {showPlatformHint && <span>该视角为上游全平台汇总数据，平台筛选不生效。</span>}
      {showBrandHint && <span>该视角无品牌维度，品牌筛选不生效。</span>}
    </div>
  ) : null;

  if (view === 'sales') return <>{hint}<SalesView rows={parseSales(result)} /></>;
  if (view === 'shop') return <>{hint}<ShopView rows={parseShops(result)} globalPlatform={platform ? PLAT_LABEL[platform] || platform : ''} /></>;
  if (view === 'cross') return <>{hint}<CrossView rows={parseCross(result)} /></>;
  if (view === 'hotword') return <>{hint}<HotwordView data={parseHotwords(result)} globalPlatform={platform ? PLAT_LABEL[platform] || platform : ''} /></>;
  // product：接口成功（未来上游修复后）直接展示原始表格
  return <>{hint}<GenericTable result={result} title="商品列表" /></>;
}

/* ---------------- 加载骨架 ---------------- */

function LoadingSkeleton({ view }: { view: ExtraViewKey }) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">正在加载「{VIEW_LABEL[view]}」数据（crawler 拉取 Excel 解析，首次约 10~30 秒）…</div>
      {view === 'sales' ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : (
        Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-md" />
        ))
      )}
    </div>
  );
}

/* ---------------- 销售价量 ---------------- */

function SalesView({ rows }: { rows: SalesPoint[] }) {
  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        period: r.period,
        销售额: r.sales != null ? r.sales / 1e8 : null,
        销量: r.volume != null ? r.volume / 1e4 : null,
      })),
    [rows],
  );

  if (!rows.length) return <EmptyHint text="当前品类暂无销售价量数据" />;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border p-4">
        <div className="text-sm font-medium mb-3">月度销售额（亿元）与销量（万件）走势</div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,130,150,0.18)" />
              <XAxis dataKey="period" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis yAxisId="left" fontSize={12} tickLine={false} axisLine={false} width={56} />
              <YAxis yAxisId="right" orientation="right" fontSize={12} tickLine={false} axisLine={false} width={56} />
              <ReTooltip
                formatter={(value, name) =>
                  name === '销售额'
                    ? [`${Number(value).toFixed(2)} 亿元`, name]
                    : [`${Number(value).toFixed(1)} 万件`, name]
                }
                labelStyle={{ color: '#152033' }}
              />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="销售额" stroke="#2F6BFF" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line yAxisId="right" type="monotone" dataKey="销量" stroke="#16A37B" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>月份</TableHead>
              <TableHead className="text-right">销售额</TableHead>
              <TableHead className="text-right">销售额同比</TableHead>
              <TableHead className="text-right">销量</TableHead>
              <TableHead className="text-right">销量同比</TableHead>
              <TableHead className="text-right">均价</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...rows].reverse().map((r) => (
              <TableRow key={r.period}>
                <TableCell className="font-medium">{r.period}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatMoney(r.sales)}</TableCell>
                <TableCell className={cn('text-right font-mono tabular-nums', yoyColor(r.salesYoy))}>
                  {formatPct(r.salesYoy)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatVolume(r.volume)}</TableCell>
                <TableCell className={cn('text-right font-mono tabular-nums', yoyColor(r.volumeYoy))}>
                  {formatPct(r.volumeYoy)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {r.avgPrice != null ? `¥${r.avgPrice.toLocaleString('zh-CN')}` : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function yoyColor(v: number | null): string {
  if (v == null) return '';
  return v >= 0 ? 'text-emerald-600' : 'text-red-500';
}

/* ---------------- 店铺列表 ---------------- */

function ShopView({ rows, globalPlatform }: { rows: ShopRow[]; globalPlatform?: string }) {
  const [plat, setPlat] = useState<string>(globalPlatform || '全部');
  const [page, setPage] = useState(1);

  const latestPeriod = useMemo(() => {
    if (!rows.length) return '';
    return rows.map((r) => r.period).sort().slice(-1)[0];
  }, [rows]);

  const platforms = useMemo(
    () => ['全部', ...Array.from(new Set(rows.map((r) => r.platform)))],
    [rows],
  );

  // 仅展示最新月份数据（历史月明细无业务意义且数据量大）
  const list = useMemo(() => {
    let l = rows.filter((r) => r.period === latestPeriod);
    if (plat !== '全部') l = l.filter((r) => r.platform === plat);
    return l.sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0));
  }, [rows, latestPeriod, plat]);

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const cur = Math.min(page, totalPages);
  const pageRows = list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  if (!rows.length) return <EmptyHint text="当前品类暂无店铺列表数据" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!globalPlatform && (
        <div className="flex flex-wrap gap-1.5">
          {platforms.map((p) => (
            <button
              key={p}
              onClick={() => {
                setPlat(p);
                setPage(1);
              }}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                plat === p
                  ? 'bg-[#2F6BFF] border-[#2F6BFF] text-white'
                  : 'bg-card border-border text-muted-foreground hover:border-[#2F6BFF] hover:text-[#2F6BFF]',
              )}
            >
              {p}
            </button>
          ))}
        </div>
        )}
        <div className="text-xs text-muted-foreground">
          {latestPeriod} 数据 · 共 {list.length} 家店铺（按销售额降序）
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">#</TableHead>
              <TableHead>平台</TableHead>
              <TableHead>店铺</TableHead>
              <TableHead className="text-right">销售额</TableHead>
              <TableHead className="text-right">销售额占比</TableHead>
              <TableHead className="text-right">销售额同比</TableHead>
              <TableHead className="text-right">销量</TableHead>
              <TableHead className="text-right">均价</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((r, i) => (
              <TableRow key={`${r.platform}-${r.name}`}>
                <TableCell className="text-muted-foreground font-mono">{(cur - 1) * PAGE_SIZE + i + 1}</TableCell>
                <TableCell>{r.platform}</TableCell>
                <TableCell className="font-medium max-w-[280px] truncate" title={r.name}>{r.name}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatMoney(r.sales)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {r.salesShare != null ? `${r.salesShare.toFixed(1)}%` : '—'}
                </TableCell>
                <TableCell className={cn('text-right font-mono tabular-nums', yoyColor(r.salesYoy))}>
                  {formatPct(r.salesYoy)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatVolume(r.volume)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {r.avgPrice != null ? `¥${r.avgPrice.toLocaleString('zh-CN')}` : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Pager page={cur} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

/* ---------------- 价格交叉 ---------------- */

function CrossView({ rows }: { rows: CrossRow[] }) {
  const top = useMemo(() => rows.slice(0, CROSS_TOP_N), [rows]);
  const bands = useMemo(() => (top[0]?.bands.map((b) => b.band) || []), [top]);

  if (!rows.length) return <EmptyHint text="当前品类暂无价格交叉数据" />;

  // 热力着色：市占率 0~100 映射蓝色深浅
  const heat = (v: number | null): string => {
    if (v == null || v <= 0) return 'transparent';
    const t = Math.min(v / 60, 1); // 60% 以上满色
    return `rgba(47,107,255,${(0.08 + t * 0.55).toFixed(3)})`;
  };
  const heatText = (v: number | null): string => {
    if (v == null || v <= 0) return 'text-muted-foreground/40';
    return v >= 35 ? 'text-white font-semibold' : 'text-[#152033]';
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Top {CROSS_TOP_N} 品牌 × 价位带「价格市占率」矩阵（所选区间月均，%；价位档按接口实际分档，颜色越深市占率越高）
      </div>
      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 bg-card min-w-[140px]">品牌</TableHead>
              <TableHead className="text-right">品牌占比</TableHead>
              {bands.map((b) => (
                <TableHead key={b} className="text-right whitespace-nowrap">{b}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {top.map((r) => (
              <TableRow key={r.brand}>
                <TableCell className="sticky left-0 bg-card font-medium whitespace-nowrap">{r.brand}</TableCell>
                <TableCell className="text-right font-mono tabular-nums font-medium">
                  {r.bandShare != null ? `${r.bandShare.toFixed(1)}%` : '—'}
                </TableCell>
                {r.bands.map((b) => (
                  <TableCell
                    key={b.band}
                    className={cn('text-right font-mono tabular-nums', heatText(b.share))}
                    style={{ background: heat(b.share) }}
                  >
                    {b.share != null && b.share > 0 ? `${b.share.toFixed(1)}` : '·'}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ---------------- 热词频次 ---------------- */

function HotwordView({ data, globalPlatform }: { data: { platforms: string[]; byPlatform: Record<string, HotRow[]> }; globalPlatform?: string }) {
  const [plat, setPlat] = useState<string>(globalPlatform || '');
  useEffect(() => {
    if (!plat && data.platforms.length) setPlat(globalPlatform || data.platforms[0]);
  }, [data.platforms, plat, globalPlatform]);

  const rows = useMemo(() => {
    const list = data.byPlatform[plat] || [];
    return list.slice(0, HOT_TOP_N);
  }, [data, plat]);

  const maxCount = rows[0]?.count || 1;

  if (!data.platforms.length) return <EmptyHint text="当前品类暂无热词频次数据" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!globalPlatform && (
        <div className="flex flex-wrap gap-1.5">
          {data.platforms.map((p) => (
            <button
              key={p}
              onClick={() => setPlat(p)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                plat === p
                  ? 'bg-[#C850C0] border-[#C850C0] text-white'
                  : 'bg-card border-border text-muted-foreground hover:border-[#C850C0] hover:text-[#C850C0]',
              )}
            >
              {p}
            </button>
          ))}
        </div>
        )}
        <div className="text-xs text-muted-foreground">Top {HOT_TOP_N} 热词（按所选区间频次合计）</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5">
        {rows.map((r, i) => (
          <div key={r.word} className="flex items-center gap-3">
            <div className={cn('w-6 text-right font-mono text-xs', i < 3 ? 'text-[#C850C0] font-bold' : 'text-muted-foreground')}>
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium truncate">{r.word}</span>
                <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                  {r.count.toLocaleString('zh-CN')} 次
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#4158D0] to-[#C850C0]"
                  style={{ width: `${Math.max(3, (r.count / maxCount) * 100)}%` }}
                />
              </div>
            </div>
            <div className={cn('w-16 text-right text-xs font-mono', yoyColor(r.yoy))}>
              {r.yoy != null ? `销额${formatPct(r.yoy)}` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 通用表格（商品列表未来用） ---------------- */

function GenericTable({ result, title }: { result: CrawlerResult; title: string }) {
  const headers = result.headers || [];
  const rows = result.rows || [];
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const cur = Math.min(page, totalPages);
  const pageRows = rows.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  if (!rows.length) return <EmptyHint text={`当前品类暂无${title}数据`} />;

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">共 {rows.length} 行</div>
      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {headers.map((h) => (
                <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row, i) => (
              <TableRow key={i}>
                {headers.map((h) => (
                  <TableCell key={h} className="whitespace-nowrap text-sm">
                    {str(row[h])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager page={cur} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

/* ---------------- 分页和空态 ---------------- */

function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between">
      <div className="text-xs text-muted-foreground">
        第 {page} / {totalPages} 页
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-3 py-1.5 rounded-md text-xs font-medium border border-border bg-card text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#2F6BFF] hover:text-[#2F6BFF] transition-colors"
        >
          上一页
        </button>
        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="px-3 py-1.5 rounded-md text-xs font-medium border border-border bg-card text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#2F6BFF] hover:text-[#2F6BFF] transition-colors"
        >
          下一页
        </button>
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">{text}</div>
  );
}
