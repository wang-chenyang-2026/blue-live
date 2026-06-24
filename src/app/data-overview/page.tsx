'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Clock,
  Trophy,
  CalendarIcon,
} from 'lucide-react';
import { BRANDS } from '@/lib/constants';

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

interface SubKpiRow {
  account: string;
  dimension: string;
  target: string;
  achieved: string;
  rate: string;
  rawRate: number;
  isLow: boolean;
}

interface ApiResponse {
  success: boolean;
  data?: {
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
    kpiData: KpiRow[];
    subAccountKpi: SubKpiRow[];
    kpiDailyRaw: number[][];
    kpiDailyDates: string[];
  };
  error?: string;
}

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
  const { currentBrand } = useApp();
  const [isClient, setIsClient] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date filter - default: current month 1st to today
  const [dateRange, setDateRange] = useState<DateRange>({ start: '', end: '' });
  const [quickLabel, setQuickLabel] = useState('本月');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Table filter
  const [accountFilter, setAccountFilter] = useState('全部');
  const [kpiTab, setKpiTab] = useState<'main' | 'sub'>('main');

  // Sort
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

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
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/feishu/sheets-data');
      const json: ApiResponse = await res.json();
      if (!json.success) throw new Error(json.error || '获取数据失败');
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '获取数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isClient) fetchData();
  }, [isClient, fetchData]);

  // Filtered daily data by date range and account
  const filteredDaily = useMemo(() => {
    if (!data?.data?.dailyData) return [];
    let rows = data.data.dailyData.filter((d) => {
      if (!dateRange.start || !dateRange.end) return true;
      return d.rawDate >= dateRange.start && d.rawDate <= dateRange.end;
    });
    if (accountFilter !== '全部') {
      rows = rows.filter((d) => d.accountName === accountFilter);
    }
    rows.sort((a, b) => (a.rawDate > b.rawDate ? (sortDir === 'asc' ? 1 : -1) : sortDir === 'asc' ? -1 : 1));
    return rows;
  }, [data, dateRange, accountFilter, sortDir]);

  // Filtered account summaries (by date range)
  const filteredAccountSummaries = useMemo(() => {
    if (!data?.data?.dailyData) return [];
    const names = ['vivo（大号）', 'vivo官方旗舰店（抖音）', 'vivo官方旗舰店（快手）'];
    const filtered = data.data.dailyData.filter((d) => {
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
  }, [data, dateRange]);

  // Brand summary (filtered by date range)
  const filteredBrandSummary = useMemo(() => {
    const filtered = data?.data?.dailyData?.filter((d) => {
      if (!dateRange.start || !dateRange.end) return true;
      return d.rawDate >= dateRange.start && d.rawDate <= dateRange.end;
    }) || [];
    return {
      gmv: filtered.reduce((s, d) => s + d.rawGmv, 0),
      sales: filtered.reduce((s, d) => s + d.rawSalesAfter, 0),
      duration: filtered.reduce((s, d) => s + d.rawDuration, 0),
    };
  }, [data, dateRange]);

  // KPI calculation: recalculate KPI "achieved" values from daily raw data filtered by date range
  const filteredKpiData = useMemo(() => {
    if (!data?.data) return [];
    const kpiDailyRaw = data.data.kpiDailyRaw;
    const kpiDailyDates = data.data.kpiDailyDates;
    const originalKpi = data.data.kpiData;
    if (!kpiDailyRaw.length || !kpiDailyDates.length) return originalKpi;

    // Find column indices that fall within the date range
    const validIndices: number[] = [];
    kpiDailyDates.forEach((date, idx) => {
      if (date >= dateRange.start && date <= dateRange.end) {
        validIndices.push(idx);
      }
    });

    // If no valid dates or all dates, return original
    if (validIndices.length === 0 || validIndices.length === kpiDailyDates.length) {
      return originalKpi;
    }

    // Recalculate achieved values for each KPI dimension
    return originalKpi.map((kpi, i) => {
      const dailyRow = kpiDailyRaw[i] || [];
      const validValues = validIndices
        .map((idx) => dailyRow[idx])
        .filter((v) => !isNaN(v));
      const achievedVal = validValues.length > 0 ? validValues.reduce((s, v) => s + v, 0) / validValues.length : 0;

      // Parse target from display string
      const targetNum = parseFloat(kpi.target.replace(/[^0-9.]/g, ''));
      let rate = targetNum > 0 ? achievedVal / targetNum : 0;

      // Format achieved display
      let achievedDisplay: string;
      const dim = kpi.dimension;
      if (dim.includes('率') || dim.includes('转粉') || dim.includes('观看')) {
        achievedDisplay = `${(achievedVal * 100).toFixed(2)}%`;
      } else if (dim.includes('GPM')) {
        achievedDisplay = Math.round(achievedVal).toLocaleString('zh-CN');
      } else if (dim.includes('停留')) {
        achievedDisplay = `${achievedVal.toFixed(1)}秒`;
      } else {
        achievedDisplay = String(achievedVal);
      }

      return {
        ...kpi,
        achieved: achievedDisplay,
        rate: `${(rate * 100).toFixed(1)}%`,
        rawRate: rate,
        isLow: rate < 1,
      };
    });
  }, [data, dateRange]);

  // Overall KPI completion rate for vivo（大号）
  const overallKpiRate = useMemo(() => {
    if (!filteredKpiData.length) return 0;
    const passed = filteredKpiData.filter((k) => k.rawRate >= 1).length;
    return passed / filteredKpiData.length;
  }, [filteredKpiData]);

  // Sub-account KPI completion rate
  const subKpiRates = useMemo(() => {
    if (!data?.data?.subAccountKpi) return {} as Record<string, number>;
    const rates: Record<string, number> = {};
    data.data.subAccountKpi.forEach((k) => {
      rates[k.account] = k.rawRate;
    });
    return rates;
  }, [data]);

  // Account-level KPI completion rate for cards
  const accountKpiRates = useMemo(() => {
    const rates: Record<string, number> = {};
    filteredAccountSummaries.forEach((a) => {
      if (a.accountName === 'vivo（大号）') {
        rates[a.accountName] = overallKpiRate;
      } else {
        rates[a.accountName] = subKpiRates[a.accountName] ?? 1;
      }
    });
    // Brand summary KPI = average of all account rates
    const allRates = Object.values(rates);
    rates['汇总'] = allRates.length > 0 ? allRates.reduce((s, v) => s + v, 0) / allRates.length : 0;
    return rates;
  }, [filteredAccountSummaries, overallKpiRate, subKpiRates]);

  // Summary row for filtered daily data
  const tableSummary = useMemo(() => ({
    duration: filteredDaily.reduce((s, d) => s + d.rawDuration, 0),
    gmv: filteredDaily.reduce((s, d) => s + d.rawGmv, 0),
    salesBefore: filteredDaily.reduce((s, d) => s + parseFloat(d.salesBeforeReturn.replace(/,/g, '') || '0'), 0),
    salesAfter: filteredDaily.reduce((s, d) => s + d.rawSalesAfter, 0),
  }), [filteredDaily]);

  // Apply custom date range
  const applyCustomRange = () => {
    if (!customStart || !customEnd) return;
    let s = new Date(customStart);
    let e = new Date(customEnd);
    // Max 1 year
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

  const accountOptions = ['全部', 'vivo（大号）', 'vivo官方旗舰店（抖音）', 'vivo官方旗舰店（快手）'];

  // Brand tabs - only vivo for now
  const brandTabs = [{ id: 'vivo', label: 'vivo' }];

  const fmt = (n: number) => n.toLocaleString('zh-CN');

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
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-2 text-zinc-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>正在获取飞书数据...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <p className="text-red-400">{error}</p>
          <Button variant="outline" onClick={fetchData}>重试</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Row 1: Brand Tabs */}
      <div className="flex items-center gap-2">
        {brandTabs.map((tab) => (
          <Button
            key={tab.id}
            variant={currentBrand === tab.id ? 'default' : 'outline'}
            size="sm"
            className={currentBrand === tab.id ? 'bg-[#415FFF] hover:bg-[#415FFF]/90' : ''}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Row 2: Data Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Brand Summary Card */}
        <Card className="bg-gradient-to-br from-[#415FFF]/20 to-[#415FFF]/5 border-[#415FFF]/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-300">vivo 汇总</CardTitle>
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

      {/* Row 3: Date Filter + Account Filter + Refresh */}
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

        <Button variant="outline" size="sm" className="border-zinc-600 text-zinc-300" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          刷新数据
        </Button>
      </div>

      {/* Row 4: Daily Data Table */}
      <Card className="bg-zinc-900/80 border-zinc-700/50">
        <CardHeader>
          <CardTitle className="text-base text-zinc-200">vivo品牌基础数据汇总</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-zinc-400">
                  <th
                    className="text-left py-2 px-3 cursor-pointer hover:text-zinc-200"
                    onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
                  >
                    日期 {sortDir === 'desc' ? '↓' : '↑'}
                  </th>
                  <th className="text-left py-2 px-3">账号名称</th>
                  <th className="text-right py-2 px-3">直播时长(h)</th>
                  <th className="text-right py-2 px-3">GMV</th>
                  <th className="text-right py-2 px-3">销售台数(退货前)</th>
                  <th className="text-right py-2 px-3">实销台数(退货后)</th>
                </tr>
              </thead>
              <tbody>
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
                {/* Summary Row */}
                <tr className="bg-zinc-800/70 font-bold">
                  <td className="py-2 px-3 text-white">汇总</td>
                  <td className="py-2 px-3 text-zinc-400">—</td>
                  <td className="py-2 px-3 text-right text-white">{tableSummary.duration}</td>
                  <td className="py-2 px-3 text-right text-white">{fmt(tableSummary.gmv)}</td>
                  <td className="py-2 px-3 text-right text-white">{fmt(tableSummary.salesBefore)}</td>
                  <td className="py-2 px-3 text-right text-white">{fmt(tableSummary.salesAfter)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {filteredDaily.length === 0 && (
            <div className="text-center py-8 text-zinc-500">所选日期范围内无数据</div>
          )}
        </CardContent>
      </Card>

      {/* Row 5: KPI Section */}
      <Card className="bg-zinc-900/80 border-zinc-700/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base text-zinc-200">KPI完成情况</CardTitle>
            <div className="flex gap-2">
              <Button
                variant={kpiTab === 'main' ? 'default' : 'outline'}
                size="sm"
                className={kpiTab === 'main' ? 'bg-[#415FFF]' : 'border-zinc-600 text-zinc-300'}
                onClick={() => setKpiTab('main')}
              >
                vivo（大号）KPI
              </Button>
              <Button
                variant={kpiTab === 'sub' ? 'default' : 'outline'}
                size="sm"
                className={kpiTab === 'sub' ? 'bg-[#415FFF]' : 'border-zinc-600 text-zinc-300'}
                onClick={() => setKpiTab('sub')}
              >
                子账号KPI
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {kpiTab === 'main' && (
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
                    {filteredKpiData.filter((k) => k.rawRate >= 1).length}/{filteredKpiData.length} 项达标
                  </div>
                </div>
                <div className="ml-auto flex flex-wrap gap-2">
                  {filteredKpiData.map((kpi, idx) => (
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
                    {filteredKpiData.map((kpi, idx) => (
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

          {kpiTab === 'sub' && data?.data?.subAccountKpi && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-zinc-400">
                    <th className="text-left py-2 px-3">账号</th>
                    <th className="text-left py-2 px-3">维度</th>
                    <th className="text-right py-2 px-3">6月目标</th>
                    <th className="text-right py-2 px-3">6月达成</th>
                    <th className="text-right py-2 px-3">达成率</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.subAccountKpi.map((kpi, idx) => (
                    <tr key={idx} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                      <td className="py-2 px-3 text-zinc-300">{kpi.account}</td>
                      <td className="py-2 px-3 text-zinc-300">{kpi.dimension}</td>
                      <td className="py-2 px-3 text-right text-zinc-300">{kpi.target}</td>
                      <td className="py-2 px-3 text-right text-zinc-300">{kpi.achieved}</td>
                      <td className={`py-2 px-3 text-right font-medium ${kpi.isLow ? 'text-red-400' : 'text-emerald-400'}`}>
                        {kpi.rate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
