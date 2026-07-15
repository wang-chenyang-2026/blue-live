'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Trophy,
  CalendarIcon,
  Database,
} from 'lucide-react';

/* ========== Types ========== */
interface DailyRow {
  date: string;
  rawDate: string;
  accountName: string;
  duration: string;
  gmv: string;
  salesBeforeReturn: string;
  salesAfterReturn: string;
  rawGmv: number;
  rawSalesAfter: number;
  rawDuration: number;
}

interface KpiRow {
  dimension: string;
  target: string;
  achieved: string;
  rate: string;
  rawRate: number;
  isLow: boolean;
}

interface KpiTab {
  label: string;
  items: KpiRow[];
  overallRate: number | null;
}

interface BrandData {
  brandSummary: { gmv: string; salesCount: string; rawGmv: number; rawSales: number };
  accountSummaries: Array<{
    accountName: string;
    gmv: string;
    salesCount: string;
    rawGmv: number;
    rawSales: number;
  }>;
  dailyData: DailyRow[];
  dailySummary: { duration: string; gmv: string; salesBeforeReturn: string; salesAfterReturn: string };
  kpiTabs: KpiTab[];
  accounts: string[];
  brandLabel: string;
  color: string;
  hasData: boolean;
}

interface SingleBrandResponse {
  success: boolean;
  mode: 'single';
  brand: string;
  data: BrandData;
  error?: string;
}

interface AllBrandsResponse {
  success: boolean;
  mode: 'all';
  data: Record<string, BrandData>;
  error?: string;
}

type ApiResponse = SingleBrandResponse | AllBrandsResponse;

/* ========== Brand Config ========== */
const BRAND_TABS = [
  { id: 'all', label: '全部', color: '#a78bfa' },
  { id: 'vivo', label: 'vivo', color: '#415FFF' },
  { id: 'iQOO', label: 'iQOO', color: '#FF6B35' },
  { id: 'IOT', label: 'IOT', color: '#00C9A7' },
] as const;

type BrandTabId = typeof BRAND_TABS[number]['id'];

/* ========== Date Helpers ========== */
function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatDisplay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${parseInt(m)}月${parseInt(d)}日`;
}

type DateRange = { start: string; end: string };

const QUICK_OPTIONS: Array<{ label: string; getRange: () => DateRange }> = [
  {
    label: '本月',
    getRange: () => {
      const now = new Date();
      return { start: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), end: toDateStr(now) };
    },
  },
  {
    label: '上月',
    getRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: toDateStr(start), end: toDateStr(end) };
    },
  },
  {
    label: '近7天',
    getRange: () => {
      const now = new Date();
      return { start: toDateStr(addDays(now, -6)), end: toDateStr(now) };
    },
  },
  {
    label: '近30天',
    getRange: () => {
      const now = new Date();
      return { start: toDateStr(addDays(now, -29)), end: toDateStr(now) };
    },
  },
];

/* ========== Main Component ========== */
export default function DataOverviewPage() {
  const [isClient, setIsClient] = useState(false);
  const [brandDataMap, setBrandDataMap] = useState<Record<string, BrandData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Brand tab - local state (not using global currentBrand)
  const [activeBrand, setActiveBrand] = useState<BrandTabId>('all');

  // Date filter
  const [dateRange, setDateRange] = useState<DateRange>({ start: '', end: '' });
  const [quickLabel, setQuickLabel] = useState('本月');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Table filter
  const [accountFilter, setAccountFilter] = useState('全部');

  // KPI tab - index into kpiTabs array
  const [kpiTabIndex, setKpiTabIndex] = useState(0);

  // Sort
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Compare month (YYYY-MM)
  const [compareMonth, setCompareMonth] = useState('');

  useEffect(() => {
    setIsClient(true);
    const now = new Date();
    const defaultRange = {
      start: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
      end: toDateStr(now),
    };
    setDateRange(defaultRange);
    setCustomStart(defaultRange.start);
    setCustomEnd(defaultRange.end);
    setCompareMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  }, []);

  // Fetch data for a specific brand or all brands
  const fetchData = useCallback(async (brand: string = 'all') => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/feishu/sheets-data?brand=${brand}`);
      const json: ApiResponse = await res.json();
      if (!json.success) throw new Error(json.error || '获取数据失败');

      // 自动检测实际数据日期范围，如果当前日期范围没有数据则自动调整
      const collectDates = (data: BrandData): string[] => {
        return (data.dailyData || [])
          .map(d => d.rawDate)
          .filter(d => d && !d.startsWith('1899'));
      };

      if (json.mode === 'all') {
        setBrandDataMap((prev) => ({ ...prev, ...json.data }));
        // 从所有品牌数据中收集可用日期
        const allDates = Object.values(json.data).flatMap(collectDates);
        if (allDates.length > 0) {
          const maxDate = allDates.reduce((a, b) => a > b ? a : b);
          const maxDataDate = new Date(maxDate);
          const adjustedEnd = toDateStr(maxDataDate);
          const adjustedStart = toDateStr(new Date(maxDataDate.getFullYear(), maxDataDate.getMonth(), 1));
          setDateRange({ start: adjustedStart, end: adjustedEnd });
          setCustomStart(adjustedStart);
          setCustomEnd(adjustedEnd);
          setCompareMonth(`${maxDataDate.getFullYear()}-${String(maxDataDate.getMonth() + 1).padStart(2, '0')}`);
          const now = new Date();
          if (maxDataDate.getFullYear() === now.getFullYear() && maxDataDate.getMonth() === now.getMonth()) {
            setQuickLabel('本月');
          } else {
            setQuickLabel('上月');
          }
        }
      } else {
        setBrandDataMap((prev) => ({ ...prev, [json.brand]: json.data }));
        const dates = collectDates(json.data);
        if (dates.length > 0) {
          const maxDate = dates.reduce((a, b) => a > b ? a : b);
          const maxDataDate = new Date(maxDate);
          const adjustedEnd = toDateStr(maxDataDate);
          const adjustedStart = toDateStr(new Date(maxDataDate.getFullYear(), maxDataDate.getMonth(), 1));
          setDateRange({ start: adjustedStart, end: adjustedEnd });
          setCustomStart(adjustedStart);
          setCustomEnd(adjustedEnd);
          setCompareMonth(`${maxDataDate.getFullYear()}-${String(maxDataDate.getMonth() + 1).padStart(2, '0')}`);
          const now = new Date();
          if (maxDataDate.getFullYear() === now.getFullYear() && maxDataDate.getMonth() === now.getMonth()) {
            setQuickLabel('本月');
          } else {
            setQuickLabel('上月');
          }
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '获取数据失败');
    } finally {
      setLoading(false);
    }
  }, [dateRange.start, dateRange.end]);

  // Fetch all brands data on mount
  useEffect(() => {
    if (isClient) fetchData('all');
  }, [isClient, fetchData]);

  // When switching to a brand that hasn't been fetched yet, fetch it
  useEffect(() => {
    if (!isClient) return;
    if (activeBrand !== 'all' && !brandDataMap[activeBrand]) {
      fetchData(activeBrand);
    }
  }, [activeBrand, isClient, brandDataMap, fetchData]);

  // Reset account filter and kpi tab when switching brand
  useEffect(() => {
    setAccountFilter('全部');
    setKpiTabIndex(0);
  }, [activeBrand]);

  // Get current brand data
  const currentBrandData = useMemo((): BrandData | null => {
    if (activeBrand === 'all') return null;
    return brandDataMap[activeBrand] || null;
  }, [activeBrand, brandDataMap]);

  // Get accounts for current brand
  const currentAccounts = useMemo((): string[] => {
    if (activeBrand === 'all') return [];
    return currentBrandData?.accounts || [];
  }, [activeBrand, currentBrandData]);

  // Account filter options
  const accountOptions = useMemo(() => {
    return ['全部', ...currentAccounts];
  }, [currentAccounts]);

  // Filtered daily data by date range and account (for single brand)
  const filteredDaily = useMemo(() => {
    if (!currentBrandData?.dailyData) return [];
    let rows = currentBrandData.dailyData.filter((d) => {
      if (!dateRange.start || !dateRange.end) return true;
      return d.rawDate >= dateRange.start && d.rawDate <= dateRange.end;
    });
    if (accountFilter !== '全部') {
      rows = rows.filter((d) => d.accountName === accountFilter);
    }
    rows.sort((a, b) => (a.rawDate > b.rawDate ? (sortDir === 'asc' ? 1 : -1) : sortDir === 'asc' ? -1 : 1));
    return rows;
  }, [currentBrandData, dateRange, accountFilter, sortDir]);

  // Filtered account summaries (by date range)
  const filteredAccountSummaries = useMemo(() => {
    if (!currentBrandData?.dailyData) return [];
    const names = currentBrandData.accounts;
    const filtered = currentBrandData.dailyData.filter((d) => {
      if (!dateRange.start || !dateRange.end) return true;
      return d.rawDate >= dateRange.start && d.rawDate <= dateRange.end;
    });
    return names.map((name) => {
      const rows = filtered.filter((d) => d.accountName === name);
      const gmv = rows.reduce((s, d) => s + d.rawGmv, 0);
      const sales = rows.reduce((s, d) => s + d.rawSalesAfter, 0);
      const duration = rows.reduce((s, d) => s + d.rawDuration, 0);
      return { accountName: name, gmv, sales, duration };
    });
  }, [currentBrandData, dateRange]);

  // Brand summary (filtered by date range) for single brand
  const filteredBrandSummary = useMemo(() => {
    const filtered = currentBrandData?.dailyData?.filter((d) => {
      if (!dateRange.start || !dateRange.end) return true;
      return d.rawDate >= dateRange.start && d.rawDate <= dateRange.end;
    }) || [];
    return {
      gmv: filtered.reduce((s, d) => s + d.rawGmv, 0),
      sales: filtered.reduce((s, d) => s + d.rawSalesAfter, 0),
      duration: filtered.reduce((s, d) => s + d.rawDuration, 0),
    };
  }, [currentBrandData, dateRange]);

  // Current KPI tab data
  const currentKpiTab = useMemo((): KpiTab | null => {
    if (!currentBrandData?.kpiTabs) return null;
    return currentBrandData.kpiTabs[kpiTabIndex] || null;
  }, [currentBrandData, kpiTabIndex]);

  // Overall KPI rate from current tab (use server-provided value)
  const overallKpiRate = useMemo(() => {
    if (!currentKpiTab) return 0;
    // Use server-provided overallRate if available, otherwise calculate from items
    if (currentKpiTab.overallRate !== null) {
      return currentKpiTab.overallRate;
    }
    // Fallback: count items where rawRate >= 1
    const items = currentKpiTab.items;
    if (!items.length) return 0;
    const passed = items.filter((k) => k.rawRate >= 1).length;
    return passed / items.length;
  }, [currentKpiTab]);

  // KPI rates per account for data cards
  const accountKpiRates = useMemo(() => {
    const rates: Record<string, number> = {};
    if (!currentBrandData?.kpiTabs) return rates;

    // First KPI tab is the "main" account KPI
    const mainTab = currentBrandData.kpiTabs[0];
    const mainAccount = currentBrandData.accounts?.[0] || '';

    if (mainTab && mainAccount) {
      const mainRate = mainTab.overallRate !== null
        ? mainTab.overallRate
        : (mainTab.items.length > 0
          ? mainTab.items.filter((k) => k.rawRate >= 1).length / mainTab.items.length
          : 0);
      rates[mainAccount] = mainRate;
    }

    // Sub-account KPI tabs (index 1+)
    for (let i = 1; i < currentBrandData.kpiTabs.length; i++) {
      const tab = currentBrandData.kpiTabs[i];
      // Try to match tab label to account name
      const matchAccount = currentBrandData.accounts.find((a) => tab.label.includes(a));
      if (matchAccount && tab.items.length > 0) {
        // For sub-accounts, use overallRate if available, else calculate
        if (tab.overallRate !== null) {
          rates[matchAccount] = tab.overallRate;
        } else {
          const passed = tab.items.filter((k) => k.rawRate >= 1).length;
          rates[matchAccount] = passed / tab.items.length;
        }
      }
    }

    // Brand summary rate
    const allRates = Object.values(rates);
    rates['汇总'] = allRates.length > 0 ? allRates.reduce((s, v) => s + v, 0) / allRates.length : 0;
    return rates;
  }, [currentBrandData]);

  const tableSummary = useMemo(() => ({
    duration: filteredDaily.reduce((s, d) => s + d.rawDuration, 0),
    gmv: filteredDaily.reduce((s, d) => s + d.rawGmv, 0),
    salesBefore: filteredDaily.reduce((s, d) => s + parseFloat(d.salesBeforeReturn.replace(/,/g, '') || '0'), 0),
    salesAfter: filteredDaily.reduce((s, d) => s + d.rawSalesAfter, 0),
  }), [filteredDaily]);

  // Available months for comparison selector (works for all brands)
  const availableMonths = useMemo(() => {
    const sources = activeBrand === 'all'
      ? Object.values(brandDataMap)
      : currentBrandData ? [currentBrandData] : [];

    const months = new Set<string>();
    for (const bd of sources) {
      if (!bd?.dailyData) continue;
      bd.dailyData.forEach(d => {
        if (d.rawDate && d.rawDate.length >= 7 && !d.rawDate.startsWith('1899')) {
          months.add(d.rawDate.substring(0, 7));
        }
      });
    }
    return Array.from(months).sort().reverse();
  }, [activeBrand, brandDataMap, currentBrandData]);

  // Monthly comparison data (works for both single brand and all brands)
  const monthlyCompareData = useMemo(() => {
    if (!compareMonth) return null;

    // Determine data source(s)
    const sources: DailyRow[] = [];
    if (activeBrand === 'all') {
      for (const bd of Object.values(brandDataMap)) {
        if (bd?.dailyData) sources.push(...bd.dailyData);
      }
    } else {
      if (!currentBrandData?.dailyData) return null;
      sources.push(...currentBrandData.dailyData);
    }

    if (sources.length === 0) return null;

    const [year, month] = compareMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth() + 1;
    const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

    const currentRows = sources.filter(d => d.rawDate && d.rawDate.startsWith(compareMonth));
    const prevRows = sources.filter(d => d.rawDate && d.rawDate.startsWith(prevMonthStr));

    const filteredCurrent = accountFilter !== '全部'
      ? currentRows.filter(d => d.accountName === accountFilter)
      : currentRows;
    const filteredPrev = accountFilter !== '全部'
      ? prevRows.filter(d => d.accountName === accountFilter)
      : prevRows;

    const calcStats = (rows: DailyRow[]) => ({
      duration: rows.reduce((s, d) => s + d.rawDuration, 0),
      gmv: rows.reduce((s, d) => s + d.rawGmv, 0),
      sales: rows.reduce((s, d) => s + d.rawSalesAfter, 0),
    });

    const current = calcStats(filteredCurrent);
    const prev = calcStats(filteredPrev);

    const pctChange = (curr: number, prevVal: number) => {
      if (prevVal === 0) return curr > 0 ? 100 : 0;
      return ((curr - prevVal) / prevVal) * 100;
    };

    return {
      currentMonth: compareMonth,
      prevMonth: prevMonthStr,
      current,
      prev,
      durationChange: pctChange(current.duration, prev.duration),
      gmvChange: pctChange(current.gmv, prev.gmv),
      salesChange: pctChange(current.sales, prev.sales),
      hasCurrentData: filteredCurrent.length > 0,
      hasPrevData: filteredPrev.length > 0,
    };
  }, [activeBrand, brandDataMap, currentBrandData, compareMonth, accountFilter]);

  // Per-account comparison rows for "all brands" view
  const allBrandsCompareRows = useMemo(() => {
    if (!compareMonth) return [];

    const [year, month] = compareMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth() + 1;
    const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

    const rows: Array<{
      accountName: string;
      brand: string;
      brandColor: string;
      curDuration: number;
      prevDuration: number;
      curGmv: number;
      prevGmv: number;
      curSales: number;
      prevSales: number;
    }> = [];

    for (const brandKey of Object.keys(brandDataMap)) {
      const bd = brandDataMap[brandKey];
      if (!bd?.dailyData) continue;

      const accounts = bd.accounts || [];
      const brandColor = bd.color || BRAND_TABS.find(b => b.id === brandKey)?.color || '#a78bfa';

      for (const accountName of accounts) {
        const accountRows = bd.dailyData.filter(d => d.accountName === accountName);

        const curRows = accountRows.filter(d => d.rawDate && d.rawDate.startsWith(compareMonth));
        const prevRows = accountRows.filter(d => d.rawDate && d.rawDate.startsWith(prevMonthStr));

        rows.push({
          accountName,
          brand: bd.brandLabel || brandKey,
          brandColor,
          curDuration: curRows.reduce((s, d) => s + d.rawDuration, 0),
          prevDuration: prevRows.reduce((s, d) => s + d.rawDuration, 0),
          curGmv: curRows.reduce((s, d) => s + d.rawGmv, 0),
          prevGmv: prevRows.reduce((s, d) => s + d.rawGmv, 0),
          curSales: curRows.reduce((s, d) => s + d.rawSalesAfter, 0),
          prevSales: prevRows.reduce((s, d) => s + d.rawSalesAfter, 0),
        });
      }
    }

    return rows;
  }, [compareMonth, brandDataMap]);

  // All-brands summary data
  const allBrandsSummary = useMemo(() => {
    const summaries: Array<{
      brandKey: string;
      brandLabel: string;
      color: string;
      gmv: number;
      sales: number;
      duration: number;
      kpiRate: number;
      hasData: boolean;
    }> = [];

    for (const bt of BRAND_TABS) {
      if (bt.id === 'all') continue;
      const bd = brandDataMap[bt.id];
      if (!bd) {
        summaries.push({
          brandKey: bt.id,
          brandLabel: bt.label,
          color: bt.color,
          gmv: 0, sales: 0, duration: 0, kpiRate: 0, hasData: false,
        });
        continue;
      }

      const filtered = bd.dailyData?.filter((d) => {
        if (!dateRange.start || !dateRange.end) return true;
        return d.rawDate >= dateRange.start && d.rawDate <= dateRange.end;
      }) || [];

      const gmv = filtered.reduce((s, d) => s + d.rawGmv, 0);
      const sales = filtered.reduce((s, d) => s + d.rawSalesAfter, 0);
      const duration = filtered.reduce((s, d) => s + d.rawDuration, 0);

      // Get KPI rate from first tab's overallRate
      const mainKpiTab = bd.kpiTabs?.[0];
      const kpiRate = mainKpiTab?.overallRate ?? 0;

      summaries.push({
        brandKey: bt.id,
        brandLabel: bd.brandLabel || bt.label,
        color: bd.color || bt.color,
        gmv,
        sales,
        duration,
        kpiRate,
        hasData: bd.hasData,
      });
    }
    return summaries;
  }, [brandDataMap, dateRange]);

  const applyCustomRange = () => {
    if (!customStart || !customEnd) return;
    let s = new Date(customStart);
    let e = new Date(customEnd);
    const maxEnd = addDays(s, 365);
    if (e > maxEnd) e = maxEnd;
    if (s > e) [s, e] = [e, s];
    setDateRange({ start: toDateStr(s), end: toDateStr(e) });
    setQuickLabel('自定义');
    setShowDatePicker(false);
  };

  const handleQuickSelect = (opt: typeof QUICK_OPTIONS[number]) => {
    const range = opt.getRange();
    setDateRange(range);
    setCustomStart(range.start);
    setCustomEnd(range.end);
    setQuickLabel(opt.label);
    setShowDatePicker(false);
  };

  const fmt = (n: number) => n.toLocaleString('zh-CN');

  // Get brand color
  const getBrandColor = () => {
    const tab = BRAND_TABS.find((t) => t.id === activeBrand);
    return tab?.color || '#415FFF';
  };

  const brandColor = getBrandColor();

  /* ========== SSR Guard ========== */
  if (!isClient) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-2 text-zinc-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  /* ========== Loading / Error States ========== */
  if (loading && Object.keys(brandDataMap).length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-2 text-zinc-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>正在获取飞书数据...</span>
        </div>
      </div>
    );
  }

  if (error && Object.keys(brandDataMap).length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <p className="text-red-400">{error}</p>
          <Button variant="outline" onClick={() => fetchData('all')}>重试</Button>
        </div>
      </div>
    );
  }

  /* ========== Render: All Brands View ========== */
  const renderAllBrandsView = () => (
    <div className="space-y-6">
      {/* Brand Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {allBrandsSummary.map((brand) => (
          <Card
            key={brand.brandKey}
            className="bg-zinc-900/80 border-zinc-700/50 cursor-pointer hover:border-zinc-600 transition-colors"
            onClick={() => setActiveBrand(brand.brandKey as BrandTabId)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: brand.color }} />
                <CardTitle className="text-sm text-zinc-300">{brand.brandLabel}</CardTitle>
                {!brand.hasData && (
                  <Badge variant="outline" className="text-xs text-zinc-500 border-zinc-600">暂无数据</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <div className="text-xs text-zinc-400">GMV</div>
                <div className="text-xl font-bold text-white">{fmt(brand.gmv)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-400">结算台数</div>
                <div className="text-lg font-semibold text-zinc-200">{fmt(brand.sales)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-400">时长</div>
                <div className="text-lg font-semibold text-zinc-200">{brand.duration}h</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly Comparison Table */}
      {allBrandsCompareRows.length > 0 && (
        <Card className="bg-zinc-900/80 border-zinc-700/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-zinc-200">月度环比对比</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">对比月份</span>
                <select
                  value={compareMonth}
                  onChange={(e) => setCompareMonth(e.target.value)}
                  className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                >
                  {availableMonths.length > 0 ? (
                    availableMonths.map((m) => {
                      const [y, mo] = m.split('-');
                      return <option key={m} value={m}>{y}年{parseInt(mo)}月</option>;
                    })
                  ) : (
                    <option value={compareMonth}>
                      {compareMonth ? `${compareMonth.split('-')[0]}年${parseInt(compareMonth.split('-')[1])}月` : ''}
                    </option>
                  )}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-zinc-700/60">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-zinc-800 text-zinc-100">
                    <th className="text-left py-3 px-4 font-semibold border-b border-zinc-600 border-r border-zinc-700/60" rowSpan={2}>账号</th>
                    <th className="text-center py-2 px-3 font-semibold border-b border-zinc-700/60 border-r border-zinc-700/60" colSpan={4}>时长 (h)</th>
                    <th className="text-center py-2 px-3 font-semibold border-b border-zinc-700/60 border-r border-zinc-700/60" colSpan={4}>GMV</th>
                    <th className="text-center py-2 px-3 font-semibold border-b border-zinc-700/60" colSpan={4}>结算台数</th>
                  </tr>
                  <tr className="bg-zinc-800/70 text-zinc-300 text-xs">
                    <th className="text-right py-2 px-3 font-medium border-b border-zinc-600 border-r border-zinc-700/40">本月</th>
                    <th className="text-right py-2 px-3 font-medium border-b border-zinc-600 border-r border-zinc-700/40">上月</th>
                    <th className="text-right py-2 px-3 font-medium border-b border-zinc-600 border-r border-zinc-700/40">涨幅</th>
                    <th className="text-right py-2 px-3 font-medium border-b border-zinc-600 border-r border-zinc-700/60">增长率</th>
                    <th className="text-right py-2 px-3 font-medium border-b border-zinc-600 border-r border-zinc-700/40">本月</th>
                    <th className="text-right py-2 px-3 font-medium border-b border-zinc-600 border-r border-zinc-700/40">上月</th>
                    <th className="text-right py-2 px-3 font-medium border-b border-zinc-600 border-r border-zinc-700/40">涨幅</th>
                    <th className="text-right py-2 px-3 font-medium border-b border-zinc-600 border-r border-zinc-700/60">增长率</th>
                    <th className="text-right py-2 px-3 font-medium border-b border-zinc-600 border-r border-zinc-700/40">本月</th>
                    <th className="text-right py-2 px-3 font-medium border-b border-zinc-600 border-r border-zinc-700/40">上月</th>
                    <th className="text-right py-2 px-3 font-medium border-b border-zinc-600 border-r border-zinc-700/40">涨幅</th>
                    <th className="text-right py-2 px-3 font-medium border-b border-zinc-600">增长率</th>
                  </tr>
                </thead>
                <tbody>
                  {allBrandsCompareRows.map((row, idx) => {
                    const calcDelta = (cur: number, prev: number) => cur - prev;
                    const calcRate = (cur: number, prev: number) => {
                      if (prev === 0) return cur > 0 ? 100 : 0;
                      return ((cur - prev) / prev) * 100;
                    };
                    const colorClass = (val: number) => val > 0 ? 'text-emerald-400' : val < 0 ? 'text-red-400' : 'text-zinc-500';

                    const dDelta = calcDelta(row.curDuration, row.prevDuration);
                    const dRate = calcRate(row.curDuration, row.prevDuration);
                    const gDelta = calcDelta(row.curGmv, row.prevGmv);
                    const gRate = calcRate(row.curGmv, row.prevGmv);
                    const sDelta = calcDelta(row.curSales, row.prevSales);
                    const sRate = calcRate(row.curSales, row.prevSales);

                    const rowBg = idx % 2 === 0 ? 'bg-zinc-900/40' : 'bg-zinc-900/10';

                    return (
                      <tr key={idx} className={`${rowBg} border-b border-zinc-800/70 hover:bg-zinc-800/60 transition-colors`}>
                        <td className="py-3 px-4 border-r border-zinc-800/60">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.brandColor }} />
                            <span className="text-zinc-100 font-medium">{row.accountName}</span>
                            <span className="text-xs text-zinc-500">({row.brand})</span>
                          </div>
                        </td>
                        {/* Duration */}
                        <td className="py-3 px-3 text-right text-white font-mono tabular-nums">{row.curDuration}</td>
                        <td className="py-3 px-3 text-right text-zinc-400 font-mono tabular-nums">{row.prevDuration}</td>
                        <td className={`py-3 px-3 text-right font-mono tabular-nums font-medium ${colorClass(dDelta)}`}>{dDelta >= 0 ? '+' : ''}{dDelta}</td>
                        <td className={`py-3 px-3 text-right font-mono tabular-nums font-medium border-r border-zinc-800/60 ${colorClass(dRate)}`}>{dRate >= 0 ? '+' : ''}{dRate.toFixed(1)}%</td>
                        {/* GMV */}
                        <td className="py-3 px-3 text-right text-white font-mono tabular-nums">{fmt(row.curGmv)}</td>
                        <td className="py-3 px-3 text-right text-zinc-400 font-mono tabular-nums">{fmt(row.prevGmv)}</td>
                        <td className={`py-3 px-3 text-right font-mono tabular-nums font-medium ${colorClass(gDelta)}`}>{gDelta >= 0 ? '+' : ''}{fmt(gDelta)}</td>
                        <td className={`py-3 px-3 text-right font-mono tabular-nums font-medium border-r border-zinc-800/60 ${colorClass(gRate)}`}>{gRate >= 0 ? '+' : ''}{gRate.toFixed(1)}%</td>
                        {/* Sales */}
                        <td className="py-3 px-3 text-right text-white font-mono tabular-nums">{fmt(row.curSales)}</td>
                        <td className="py-3 px-3 text-right text-zinc-400 font-mono tabular-nums">{fmt(row.prevSales)}</td>
                        <td className={`py-3 px-3 text-right font-mono tabular-nums font-medium ${colorClass(sDelta)}`}>{sDelta >= 0 ? '+' : ''}{fmt(sDelta)}</td>
                        <td className={`py-3 px-3 text-right font-mono tabular-nums font-medium ${colorClass(sRate)}`}>{sRate >= 0 ? '+' : ''}{sRate.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {allBrandsCompareRows.length === 0 && (
              <div className="text-center py-8 text-zinc-500">所选月份暂无数据</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );

  /* ========== Render: Single Brand View ========== */
  const renderSingleBrandView = () => {
    if (!currentBrandData) {
      return (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <RefreshCw className={`h-5 w-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? '正在加载数据...' : '暂无数据'}</span>
        </div>
      );
    }

    if (!currentBrandData.hasData) {
      return (
        <div className="flex items-center justify-center py-16 text-zinc-500">
          <Database className="h-5 w-5 mr-2" />
          <span>{currentBrandData.brandLabel} 品牌数据即将上线，敬请期待</span>
        </div>
      );
    }

    return (
      <>
        {/* Data Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Brand Summary Card */}
          <Card className="bg-gradient-to-br from-[#415FFF]/20 to-[#415FFF]/5 border-[#415FFF]/30" style={{ borderColor: `${brandColor}50`, background: `linear-gradient(to bottom right, ${brandColor}33, ${brandColor}0d)` }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-300">{currentBrandData.brandLabel} 汇总</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <div className="text-xs text-zinc-400">GMV</div>
                <div className="text-xl font-bold text-white">{fmt(filteredBrandSummary.gmv)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-400">结算台数</div>
                <div className="text-lg font-semibold text-zinc-200">{fmt(filteredBrandSummary.sales)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-400">KPI完成率</div>
                <div className={`text-lg font-semibold ${(accountKpiRates['汇总'] ?? 0) >= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {((accountKpiRates['汇总'] ?? 0) * 100).toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-400">时长</div>
                <div className="text-lg font-semibold text-zinc-200">{filteredBrandSummary.duration}h</div>
              </div>
            </CardContent>
          </Card>

          {/* Account Cards */}
          {filteredAccountSummaries.map((acc) => {
            const kpiRate = accountKpiRates[acc.accountName] ?? 0;
            return (
              <Card key={acc.accountName} className="bg-zinc-900/80 border-zinc-700/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-zinc-300">{acc.accountName}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <div className="text-xs text-zinc-400">GMV</div>
                    <div className="text-xl font-bold text-white">{fmt(acc.gmv)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">结算台数</div>
                    <div className="text-lg font-semibold text-zinc-200">{fmt(acc.sales)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">KPI完成率</div>
                    <div className={`text-lg font-semibold ${kpiRate >= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {(kpiRate * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400">时长</div>
                    <div className="text-lg font-semibold text-zinc-200">{acc.duration}h</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Date Filter + Account Filter + Refresh */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Date Range Selector */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-zinc-600 text-zinc-300 hover:bg-zinc-800"
              onClick={() => setShowDatePicker(!showDatePicker)}
            >
              <CalendarIcon className="h-4 w-4" />
              {dateRange.start && dateRange.end
                ? `${formatDisplay(dateRange.start)} - ${formatDisplay(dateRange.end)}`
                : '选择日期'}
            </Button>
            {showDatePicker && (
              <div className="absolute top-full left-0 mt-2 z-50 bg-zinc-900 border border-zinc-700 rounded-lg p-4 shadow-xl min-w-[280px]">
                {/* Quick Options */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {QUICK_OPTIONS.map((opt) => (
                    <Button
                      key={opt.label}
                      variant={quickLabel === opt.label ? 'default' : 'outline'}
                      size="sm"
                      className={quickLabel === opt.label ? 'bg-[#415FFF]' : 'border-zinc-600 text-zinc-300'}
                      onClick={() => handleQuickSelect(opt)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
                {/* Custom Range */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-zinc-400 w-12">开始</label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-zinc-200 flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-zinc-400 w-12">结束</label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-zinc-200 flex-1"
                    />
                  </div>
                  <Button size="sm" className="w-full bg-[#415FFF] mt-2" onClick={applyCustomRange}>
                    应用
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="h-5 w-px bg-zinc-700" />

          {/* Account Filter */}
          {accountOptions.map((opt) => (
            <Button
              key={opt}
              variant={accountFilter === opt ? 'default' : 'outline'}
              size="sm"
              className={accountFilter === opt ? 'bg-[#415FFF]' : 'border-zinc-600 text-zinc-300'}
              onClick={() => setAccountFilter(opt)}
            >
              {opt}
            </Button>
          ))}

          <div className="flex-1" />

          <Button variant="outline" size="sm" className="border-zinc-600 text-zinc-300" onClick={() => fetchData(activeBrand === 'all' ? 'all' : activeBrand)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            刷新数据
          </Button>
        </div>

        {/* Daily Data Table */}
        <Card className="bg-zinc-900/80 border-zinc-700/50">
          <CardHeader>
            <CardTitle className="text-base text-zinc-200">{currentBrandData.brandLabel}品牌基础数据汇总</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-zinc-800 [&::-webkit-scrollbar-thumb]:bg-zinc-600 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-zinc-500">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-zinc-900">
                  <tr className="border-b border-zinc-700 text-zinc-400">
                    <th
                      className="text-left py-2 px-3 cursor-pointer hover:text-zinc-200 bg-zinc-900"
                      onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
                    >
                      日期 {sortDir === 'desc' ? '↓' : '↑'}
                    </th>
                    <th className="text-left py-2 px-3 bg-zinc-900">账号名称</th>
                    <th className="text-right py-2 px-3 bg-zinc-900">直播时长(h)</th>
                    <th className="text-right py-2 px-3 bg-zinc-900">GMV</th>
                    <th className="text-right py-2 px-3 bg-zinc-900">销售台数(退货前)</th>
                    <th className="text-right py-2 px-3 bg-zinc-900">实销台数(退货后)</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Summary Row - sticky at top */}
                  <tr className="sticky top-[41px] z-[5] bg-blue-900/30 font-bold border-b border-blue-500/30">
                    <td className="py-2 px-3 text-white">汇总</td>
                    <td className="py-2 px-3 text-zinc-400">—</td>
                    <td className="py-2 px-3 text-right text-white">{tableSummary.duration}</td>
                    <td className="py-2 px-3 text-right text-white">{fmt(tableSummary.gmv)}</td>
                    <td className="py-2 px-3 text-right text-white">{fmt(tableSummary.salesBefore)}</td>
                    <td className="py-2 px-3 text-right text-white">{fmt(tableSummary.salesAfter)}</td>
                  </tr>
                  {filteredDaily.map((row, idx) => (
                    <tr key={idx} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                      <td className="py-2 px-3 text-zinc-300">{row.date}</td>
                      <td className="py-2 px-3 text-zinc-300">{row.accountName}</td>
                      <td className="py-2 px-3 text-right text-zinc-300">{row.duration}</td>
                      <td className="py-2 px-3 text-right font-medium text-white">{row.gmv}</td>
                      <td className="py-2 px-3 text-right text-zinc-300">{row.salesBeforeReturn}</td>
                      <td className="py-2 px-3 text-right text-zinc-300">{row.salesAfterReturn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredDaily.length === 0 && (
              <div className="text-center py-8 text-zinc-500">所选日期范围内无数据</div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Comparison Table */}
        {monthlyCompareData && (
          <Card className="bg-zinc-900/80 border-zinc-700/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-zinc-200">月度环比对比</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">对比月份</span>
                  <select
                    value={compareMonth}
                    onChange={(e) => setCompareMonth(e.target.value)}
                    className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                  >
                    {availableMonths.length > 0 ? (
                      availableMonths.map((m) => {
                        const [y, mo] = m.split('-');
                        return <option key={m} value={m}>{y}年{parseInt(mo)}月</option>;
                      })
                    ) : (
                      <option value={compareMonth}>
                        {compareMonth ? `${compareMonth.split('-')[0]}年${parseInt(compareMonth.split('-')[1])}月` : ''}
                      </option>
                    )}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-zinc-700/60">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-zinc-800 text-zinc-100">
                      <th className="text-left py-3 px-4 font-semibold border-b border-zinc-600 border-r border-zinc-700/60">指标</th>
                      <th className="text-right py-3 px-4 font-semibold border-b border-zinc-600 border-r border-zinc-700/60">
                        {(() => { const [y, m] = monthlyCompareData.currentMonth.split('-'); return `${y}年${parseInt(m)}月`; })()}
                      </th>
                      <th className="text-right py-3 px-4 font-semibold border-b border-zinc-600 border-r border-zinc-700/60">
                        {(() => { const [y, m] = monthlyCompareData.prevMonth.split('-'); return `${y}年${parseInt(m)}月`; })()}
                      </th>
                      <th className="text-right py-3 px-4 font-semibold border-b border-zinc-600">环比变化</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Duration Row */}
                    <tr className="bg-zinc-900/40 border-b border-zinc-800/70 hover:bg-zinc-800/60 transition-colors">
                      <td className="py-3 px-4 text-zinc-200 font-medium border-r border-zinc-800/60">直播时长</td>
                      <td className="py-3 px-4 text-right text-white font-semibold font-mono tabular-nums border-r border-zinc-800/60">{monthlyCompareData.current.duration}h</td>
                      <td className="py-3 px-4 text-right text-zinc-400 font-mono tabular-nums border-r border-zinc-800/60">{monthlyCompareData.prev.duration}h</td>
                      <td className="py-3 px-4 text-right">
                        <span className={`inline-flex items-center gap-1 font-mono tabular-nums font-medium ${monthlyCompareData.durationChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {monthlyCompareData.durationChange >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                          {monthlyCompareData.durationChange >= 0 ? '+' : ''}{monthlyCompareData.durationChange.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                    {/* GMV Row */}
                    <tr className="bg-zinc-900/10 border-b border-zinc-800/70 hover:bg-zinc-800/60 transition-colors">
                      <td className="py-3 px-4 text-zinc-200 font-medium border-r border-zinc-800/60">GMV</td>
                      <td className="py-3 px-4 text-right text-white font-semibold font-mono tabular-nums border-r border-zinc-800/60">{fmt(monthlyCompareData.current.gmv)}</td>
                      <td className="py-3 px-4 text-right text-zinc-400 font-mono tabular-nums border-r border-zinc-800/60">{fmt(monthlyCompareData.prev.gmv)}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={`inline-flex items-center gap-1 font-mono tabular-nums font-medium ${monthlyCompareData.gmvChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {monthlyCompareData.gmvChange >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                          {monthlyCompareData.gmvChange >= 0 ? '+' : ''}{monthlyCompareData.gmvChange.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                    {/* Sales Row */}
                    <tr className="bg-zinc-900/40 hover:bg-zinc-800/60 transition-colors">
                      <td className="py-3 px-4 text-zinc-200 font-medium border-r border-zinc-800/60">结算台数</td>
                      <td className="py-3 px-4 text-right text-white font-semibold font-mono tabular-nums border-r border-zinc-800/60">{fmt(monthlyCompareData.current.sales)}</td>
                      <td className="py-3 px-4 text-right text-zinc-400 font-mono tabular-nums border-r border-zinc-800/60">{fmt(monthlyCompareData.prev.sales)}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={`inline-flex items-center gap-1 font-mono tabular-nums font-medium ${monthlyCompareData.salesChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {monthlyCompareData.salesChange >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                          {monthlyCompareData.salesChange >= 0 ? '+' : ''}{monthlyCompareData.salesChange.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {!monthlyCompareData.hasPrevData && (
                <div className="text-center py-4 text-zinc-500 text-xs">上月暂无数据，无法计算环比</div>
              )}
            </CardContent>
          </Card>
        )}

        {/* KPI Section */}
        {currentBrandData.kpiTabs && currentBrandData.kpiTabs.length > 0 && (
          <Card className="bg-zinc-900/80 border-zinc-700/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-zinc-200">KPI完成情况</CardTitle>
                <div className="flex gap-2">
                  {currentBrandData.kpiTabs.map((tab, idx) => (
                    <Button
                      key={idx}
                      variant={kpiTabIndex === idx ? 'default' : 'outline'}
                      size="sm"
                      className={kpiTabIndex === idx ? 'bg-[#415FFF]' : 'border-zinc-600 text-zinc-300'}
                      onClick={() => setKpiTabIndex(idx)}
                    >
                      {tab.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {currentKpiTab && currentKpiTab.items.length > 0 && (
                <>
                  {/* Overall Completion Rate Card */}
                  <div className="mb-4 flex items-center gap-4 bg-zinc-800/50 rounded-lg p-4">
                    <div className={`flex items-center justify-center w-16 h-16 rounded-full ${overallKpiRate >= 1 ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
                      <Trophy className={`h-8 w-8 ${overallKpiRate >= 1 ? 'text-emerald-400' : 'text-amber-400'}`} />
                    </div>
                    <div>
                      <div className="text-sm text-zinc-400">整体完成率</div>
                      <div className={`text-3xl font-bold ${overallKpiRate >= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {(overallKpiRate * 100).toFixed(0)}%
                      </div>
                      <div className="text-xs text-zinc-500">
                        {currentKpiTab.items.filter((k) => k.rawRate >= 1).length}/{currentKpiTab.items.length} 项达标
                      </div>
                    </div>
                    <div className="ml-auto flex flex-wrap gap-2">
                      {currentKpiTab.items.map((kpi, idx) => (
                        <Badge
                          key={idx}
                          variant="outline"
                          className={kpi.rawRate >= 1 ? 'border-emerald-500/50 text-emerald-400' : 'border-red-500/50 text-red-400'}
                        >
                          {kpi.rawRate >= 1 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                          {kpi.dimension}: {kpi.rate}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {/* KPI Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-700 text-zinc-400">
                          <th className="text-left py-2 px-3">维度</th>
                          <th className="text-right py-2 px-3">6月目标</th>
                          <th className="text-right py-2 px-3">6月达成</th>
                          <th className="text-right py-2 px-3">达成率</th>
                          <th className="text-right py-2 px-3">整体完成率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentKpiTab.items.map((kpi, idx) => (
                          <tr key={idx} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                            <td className="py-2 px-3 text-zinc-300">{kpi.dimension}</td>
                            <td className="py-2 px-3 text-right text-zinc-300">{kpi.target}</td>
                            <td className="py-2 px-3 text-right text-zinc-300">{kpi.achieved}</td>
                            <td className={`py-2 px-3 text-right font-medium ${kpi.isLow ? 'text-red-400' : 'text-emerald-400'}`}>
                              {kpi.rate}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {idx === 0 ? (
                                <span className={`font-bold text-lg ${overallKpiRate >= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                  {(overallKpiRate * 100).toFixed(0)}%
                                </span>
                              ) : (
                                <span className="text-zinc-600">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {currentKpiTab && currentKpiTab.items.length === 0 && (
                <div className="text-center py-8 text-zinc-500">暂无KPI数据</div>
              )}
            </CardContent>
          </Card>
        )}
      </>
    );
  };

  return (
    <div className="space-y-6">
      {/* Row 1: Brand Tabs */}
      <div className="flex items-center gap-2">
        {BRAND_TABS.map((tab) => (
          <Button
            key={tab.id}
            variant={activeBrand === tab.id ? 'default' : 'outline'}
            size="sm"
            className={activeBrand === tab.id ? 'hover:opacity-90' : 'border-zinc-600 text-zinc-300'}
            style={activeBrand === tab.id ? { backgroundColor: tab.color } : {}}
            onClick={() => setActiveBrand(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Row 2+: Content based on active brand */}
      {activeBrand === 'all' ? renderAllBrandsView() : renderSingleBrandView()}
    </div>
  );
}

