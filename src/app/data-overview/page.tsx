'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { BRANDS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  TrendingUp,
  Clock,
  Smartphone,
  RefreshCw,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/* ==================== Types ==================== */
interface DailyRow {
  date: string;
  accountName: string;
  duration: string;
  gmv: string;
  salesBeforeReturn: string;
  salesAfterReturn: string;
  rawGmv: number;
  rawSalesAfter: number;
  rawDuration: number;
}

interface AccountSummary {
  accountName: string;
  gmv: string;
  salesCount: string;
  rawGmv: number;
  rawSales: number;
}

interface KPIRow {
  dimension: string;
  target: string;
  achieved: string;
  rate: string;
  isLow: boolean;
}

interface SubKPIRow {
  account: string;
  dimension: string;
  target: string;
  achieved: string;
  rate: string;
  isLow: boolean;
}

interface ApiResponse {
  success: boolean;
  data?: {
    brandSummary: { gmv: string; salesCount: string; rawGmv: number; rawSales: number };
    accountSummaries: AccountSummary[];
    dailyData: DailyRow[];
    dailySummary: { duration: string; gmv: string; salesBeforeReturn: string; salesAfterReturn: string };
    kpiData: KPIRow[];
    subAccountKpi: SubKPIRow[];
  };
  error?: string;
}

/* ==================== Brand Config ==================== */
const VIVO_ACCOUNTS = ['vivo（大号）', 'vivo官方旗舰店（抖音）', 'vivo官方旗舰店（快手）'];
const VIVO_COLOR = '#415FFF';

/* ==================== Component ==================== */
export default function DataOverviewPage() {
  const { isClient } = useApp();
  const [data, setData] = useState<ApiResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('vivo');
  const [selectedAccount, setSelectedAccount] = useState('全部');
  const [sortField, setSortField] = useState<'date' | 'gmv' | 'sales'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [kpiTab, setKpiTab] = useState<'main' | 'sub'>('main');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/feishu/sheets-data');
      const json: ApiResponse = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error || '数据加载失败');
      }
    } catch {
      setError('网络请求失败，请检查飞书API配置');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isClient) {
      fetchData();
    }
  }, [isClient, fetchData]);

  // Filter daily data by account
  const filteredDaily = data?.dailyData
    ? data.dailyData.filter((d) =>
        selectedAccount === '全部' ? true : d.accountName === selectedAccount
      )
    : [];

  // Sort daily data
  const sortedDaily = [...filteredDaily].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'date') {
      cmp = a.date.localeCompare(b.date, 'zh');
    } else if (sortField === 'gmv') {
      cmp = a.rawGmv - b.rawGmv;
    } else {
      cmp = a.rawSalesAfter - b.rawSalesAfter;
    }
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const toggleSort = (field: 'date' | 'gmv' | 'sales') => {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // SSR guard
  if (!isClient) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-zinc-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-100">数据概览</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={loading}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1', loading && 'animate-spin')} />
          刷新数据
        </Button>
      </div>

      {/* Row 1 - Brand Selector */}
      <div className="flex gap-2">
        {['vivo'].map((brand) => {
          const brandConfig = BRANDS.find((b) => b.id === brand);
          return (
            <button
              key={brand}
              onClick={() => {
                setSelectedBrand(brand);
                setSelectedAccount('全部');
              }}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                selectedBrand === brand
                  ? 'text-white shadow-lg'
                  : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              )}
              style={
                selectedBrand === brand
                  ? { backgroundColor: brandConfig?.color || VIVO_COLOR }
                  : undefined
              }
            >
              {brandConfig?.name || brand}
            </button>
          );
        })}
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-900/50 bg-red-950/20">
          <CardContent className="py-4">
            <p className="text-red-400 text-sm">{error}</p>
            <p className="text-zinc-500 text-xs mt-1">
              请确认 FEISHU_APP_SECRET 环境变量已正确设置
            </p>
          </CardContent>
        </Card>
      )}

      {/* Row 2 - Data Cards */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Brand Summary Card */}
          <Card className="border-zinc-800 bg-zinc-900/80 lg:col-span-1">
            <div
              className="h-1 rounded-t-lg"
              style={{ backgroundColor: VIVO_COLOR }}
            />
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-400">vivo 汇总</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-zinc-500">GMV</p>
                <p className="text-lg font-bold text-zinc-100">
                  ¥{data.brandSummary.gmv}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">结算台数</p>
                <p className="text-lg font-bold text-zinc-100">
                  {data.brandSummary.salesCount}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Account Cards */}
          {data.accountSummaries.map((acc) => (
            <Card key={acc.accountName} className="border-zinc-800 bg-zinc-900/80">
              <div
                className="h-1 rounded-t-lg"
                style={{ backgroundColor: VIVO_COLOR, opacity: 0.6 }}
              />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-zinc-400 truncate">
                  {acc.accountName}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-zinc-500">GMV</p>
                  <p className="text-lg font-bold text-zinc-100">¥{acc.gmv}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">结算台数</p>
                  <p className="text-lg font-bold text-zinc-100">{acc.salesCount}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Row 3 - Account Filter Tags */}
      {data && (
        <div className="flex gap-2 flex-wrap">
          {['全部', ...VIVO_ACCOUNTS].map((name) => (
            <button
              key={name}
              onClick={() => setSelectedAccount(name)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150',
                selectedAccount === name
                  ? 'text-white'
                  : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              )}
              style={
                selectedAccount === name
                  ? { backgroundColor: VIVO_COLOR }
                  : undefined
              }
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Row 4 - Daily Data Table */}
      {data && (
        <Card className="border-zinc-800 bg-zinc-900/80">
          <CardHeader>
            <CardTitle className="text-base text-zinc-200 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" style={{ color: VIVO_COLOR }} />
              vivo 品牌基础数据汇总
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th
                      className="text-left py-3 px-3 text-zinc-400 font-medium cursor-pointer hover:text-zinc-200"
                      onClick={() => toggleSort('date')}
                    >
                      <span className="flex items-center gap-1">
                        日期
                        <ArrowUpDown className="h-3 w-3" />
                        {sortField === 'date' &&
                          (sortDir === 'desc' ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronUp className="h-3 w-3" />
                          ))}
                      </span>
                    </th>
                    <th className="text-left py-3 px-3 text-zinc-400 font-medium">
                      账号名称
                    </th>
                    <th className="text-right py-3 px-3 text-zinc-400 font-medium">
                      <span className="flex items-center justify-end gap-1">
                        <Clock className="h-3 w-3" />
                        直播时长(h)
                      </span>
                    </th>
                    <th
                      className="text-right py-3 px-3 text-zinc-400 font-medium cursor-pointer hover:text-zinc-200"
                      onClick={() => toggleSort('gmv')}
                    >
                      <span className="flex items-center justify-end gap-1">
                        <TrendingUp className="h-3 w-3" />
                        GMV
                        {sortField === 'gmv' &&
                          (sortDir === 'desc' ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronUp className="h-3 w-3" />
                          ))}
                      </span>
                    </th>
                    <th className="text-right py-3 px-3 text-zinc-400 font-medium">
                      销售台数(退货前)
                    </th>
                    <th
                      className="text-right py-3 px-3 text-zinc-400 font-medium cursor-pointer hover:text-zinc-200"
                      onClick={() => toggleSort('sales')}
                    >
                      <span className="flex items-center justify-end gap-1">
                        <Smartphone className="h-3 w-3" />
                        实销台数(退货后)
                        {sortField === 'sales' &&
                          (sortDir === 'desc' ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronUp className="h-3 w-3" />
                          ))}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDaily.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-8 text-center text-zinc-500"
                      >
                        暂无数据
                      </td>
                    </tr>
                  ) : (
                    sortedDaily.map((row, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                      >
                        <td className="py-2.5 px-3 text-zinc-200">{row.date}</td>
                        <td className="py-2.5 px-3 text-zinc-300">
                          {row.accountName}
                        </td>
                        <td className="py-2.5 px-3 text-right text-zinc-300">
                          {row.duration}
                        </td>
                        <td className="py-2.5 px-3 text-right text-zinc-200 font-medium">
                          ¥{row.gmv}
                        </td>
                        <td className="py-2.5 px-3 text-right text-zinc-300">
                          {row.salesBeforeReturn}
                        </td>
                        <td className="py-2.5 px-3 text-right text-zinc-200 font-medium">
                          {row.salesAfterReturn}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {data.dailySummary && sortedDaily.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-zinc-700 bg-zinc-800/30 font-medium">
                      <td className="py-3 px-3 text-zinc-200">汇总</td>
                      <td className="py-3 px-3 text-zinc-300">-</td>
                      <td className="py-3 px-3 text-right text-zinc-200">
                        {data.dailySummary.duration}
                      </td>
                      <td className="py-3 px-3 text-right text-zinc-100">
                        ¥{data.dailySummary.gmv}
                      </td>
                      <td className="py-3 px-3 text-right text-zinc-200">
                        {data.dailySummary.salesBeforeReturn}
                      </td>
                      <td className="py-3 px-3 text-right text-zinc-100">
                        {data.dailySummary.salesAfterReturn}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Section */}
      {data && (
        <Card className="border-zinc-800 bg-zinc-900/80">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-zinc-200">KPI 完成情况</CardTitle>
              <div className="flex gap-1">
                <button
                  onClick={() => setKpiTab('main')}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs font-medium transition-all duration-150',
                    kpiTab === 'main'
                      ? 'text-white'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  )}
                  style={
                    kpiTab === 'main'
                      ? { backgroundColor: VIVO_COLOR }
                      : undefined
                  }
                >
                  vivo（大号）KPI
                </button>
                <button
                  onClick={() => setKpiTab('sub')}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs font-medium transition-all duration-150',
                    kpiTab === 'sub'
                      ? 'text-white'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  )}
                  style={
                    kpiTab === 'sub'
                      ? { backgroundColor: VIVO_COLOR }
                      : undefined
                  }
                >
                  子账号KPI
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {kpiTab === 'main' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-3 px-3 text-zinc-400 font-medium">
                        维度
                      </th>
                      <th className="text-right py-3 px-3 text-zinc-400 font-medium">
                        6月目标
                      </th>
                      <th className="text-right py-3 px-3 text-zinc-400 font-medium">
                        6月达成
                      </th>
                      <th className="text-right py-3 px-3 text-zinc-400 font-medium">
                        达成率
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.kpiData.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="py-8 text-center text-zinc-500"
                        >
                          暂无KPI数据
                        </td>
                      </tr>
                    ) : (
                      data.kpiData.map((row, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                        >
                          <td className="py-2.5 px-3 text-zinc-200">
                            {row.dimension}
                          </td>
                          <td className="py-2.5 px-3 text-right text-zinc-300">
                            {row.target}
                          </td>
                          <td className="py-2.5 px-3 text-right text-zinc-200 font-medium">
                            {row.achieved}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <Badge
                              variant={row.isLow ? 'destructive' : 'default'}
                              className={
                                row.isLow
                                  ? 'bg-red-900/50 text-red-400 hover:bg-red-900/60'
                                  : 'bg-emerald-900/50 text-emerald-400 hover:bg-emerald-900/60'
                              }
                            >
                              {row.rate}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-3 px-3 text-zinc-400 font-medium">
                        账号
                      </th>
                      <th className="text-left py-3 px-3 text-zinc-400 font-medium">
                        维度
                      </th>
                      <th className="text-right py-3 px-3 text-zinc-400 font-medium">
                        6月目标
                      </th>
                      <th className="text-right py-3 px-3 text-zinc-400 font-medium">
                        6月达成
                      </th>
                      <th className="text-right py-3 px-3 text-zinc-400 font-medium">
                        达成率
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subAccountKpi.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-8 text-center text-zinc-500"
                        >
                          暂无KPI数据
                        </td>
                      </tr>
                    ) : (
                      data.subAccountKpi.map((row, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                        >
                          <td className="py-2.5 px-3 text-zinc-200">
                            {row.account}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-300">
                            {row.dimension}
                          </td>
                          <td className="py-2.5 px-3 text-right text-zinc-300">
                            {row.target}
                          </td>
                          <td className="py-2.5 px-3 text-right text-zinc-200 font-medium">
                            {row.achieved}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <Badge
                              variant={row.isLow ? 'destructive' : 'default'}
                              className={
                                row.isLow
                                  ? 'bg-red-900/50 text-red-400 hover:bg-red-900/60'
                                  : 'bg-emerald-900/50 text-emerald-400 hover:bg-emerald-900/60'
                              }
                            >
                              {row.rate}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-zinc-500" />
          <span className="ml-2 text-zinc-400">正在加载飞书数据...</span>
        </div>
      )}
    </div>
  );
}
