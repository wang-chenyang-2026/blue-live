'use client';

import { useEffect, useState, useCallback, useMemo, memo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { BRANDS, COST_CATEGORIES } from '@/lib/constants';
import {
  getRevenueList,
  getKPIList,
  updateKPIItem,
  calcProfitRate,
} from '@/lib/store';
import type { RevenueItem, KPIItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useSafeMonth } from '@/lib/hooks';
import {
  Search,
  Download,
  RefreshCw,
  ExternalLink,
  Mic,
  Monitor,
  Users,
  Package,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

// ==================== 常量定义 ====================

const BRAND_COLORS: Record<string, string> = {
  vivo: '#4158D0',
  iqoo: '#7B61FF',
  all: '#4158D0',
  iot: '#10B981',
};

const CATEGORY_CONFIG: Record<string, {
  label: string;
  icon: React.ReactNode;
  bg: string;
  text: string;
  tagBg: string;
  tagText: string;
  dimKey?: string;
  role?: string;
}> = {
  '兼职主播成本': {
    label: '兼职主播',
    icon: <Mic className="w-4 h-4" />,
    bg: 'rgba(65,88,208,0.15)',
    text: '#4158D0',
    tagBg: 'rgba(65,88,208,0.15)',
    tagText: '#4158D0',
    dimKey: 'anchor',
  },
  '兼职中控成本': {
    label: '兼职中控',
    icon: <Monitor className="w-4 h-4" />,
    bg: 'rgba(123,97,255,0.15)',
    text: '#7B61FF',
    tagBg: 'rgba(123,97,255,0.15)',
    tagText: '#7B61FF',
    dimKey: 'control',
  },
  '全职主播成本': {
    label: '全职主播',
    icon: <Users className="w-4 h-4" />,
    bg: 'rgba(65,88,208,0.1)',
    text: '#6B7FE8',
    tagBg: 'rgba(65,88,208,0.1)',
    tagText: '#6B7FE8',
    dimKey: 'fulltime',
    role: '主播',
  },
  '全职中控成本': {
    label: '全职中控',
    icon: <Monitor className="w-4 h-4" />,
    bg: 'rgba(123,97,255,0.1)',
    text: '#9B85FF',
    tagBg: 'rgba(123,97,255,0.1)',
    tagText: '#9B85FF',
    dimKey: 'fulltime',
    role: '中控',
  },
  '日常物料成本': {
    label: '日常物料',
    icon: <Package className="w-4 h-4" />,
    bg: 'rgba(107,114,128,0.15)',
    text: '#6B7280',
    tagBg: 'rgba(107,114,128,0.15)',
    tagText: '#6B7280',
    dimKey: 'purchase',
  },
  '其它成本': {
    label: '其它',
    icon: <MoreHorizontal className="w-4 h-4" />,
    bg: 'rgba(107,114,128,0.1)',
    text: '#6B7280',
    tagBg: 'rgba(107,114,128,0.1)',
    tagText: '#6B7280',
  },
};

// ==================== 类型定义 ====================
interface FeishuDimension {
  total: number;
  details: Array<{
    name: string;
    hours?: number;
    rate?: number;
    cost: number;
    role?: string;
    base?: number;
    subsidy?: number;
    remark?: string;
    mode?: string;
  }>;
}

interface FeishuData {
  month: string;
  brand: string;
  dimensions: {
    anchor: FeishuDimension;
    control: FeishuDimension;
    fulltime: FeishuDimension;
    purchase: FeishuDimension;
  };
  totalCost: number;
  byBrand: Record<string, number>;
}

interface TableRow {
  id: string;
  category: string;
  name: string;
  amount: number;
  remark: string;
}

// ==================== 工具函数 ====================
function formatCurrency(n: number): string {
  return `¥${n.toLocaleString('zh-CN')}`;
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonthRange(month: string): { start: string; end: string } {
  if (!month) return { start: '', end: '' };
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = getToday();
  const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  return {
    start: `${y}-${String(m).padStart(2, '0')}-01`,
    end: today > monthEnd ? monthEnd : today,
  };
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  return dateStr.replace(/-/g, '/');
}

// ==================== 主组件 ====================
export default function CostPagePM() {
  const { currentBrand, isClient } = useApp();
  const safeMonth = useSafeMonth();

  // 状态
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeBrand, setActiveBrand] = useState('all');
  const [feishuData, setFeishuData] = useState<FeishuData | null>(null);
  const [feishuLoading, setFeishuLoading] = useState(false);
  const [kpis, setKpis] = useState<KPIItem[]>([]);
  const [revenues, setRevenues] = useState<RevenueItem[]>([]);
  const [activeTab, setActiveTab] = useState<'cost' | 'revenue' | 'kpi' | 'profit'>('cost');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const selectedMonth = useMemo(() => {
    if (!startDate) return '';
    return startDate.slice(0, 7);
  }, [startDate]);

  const brandColor = BRAND_COLORS[activeBrand] || '#4158D0';

  // 初始化日期
  useEffect(() => {
    if (safeMonth && !startDate) {
      const range = getMonthRange(safeMonth);
      setStartDate(range.start);
      setEndDate(range.end);
    }
  }, [safeMonth]);

  // 同步全局品牌
  useEffect(() => {
    if (currentBrand !== 'all') {
      setActiveBrand(currentBrand);
    }
  }, [currentBrand]);

  // 加载数据
  const loadData = useCallback(() => {
    setRevenues(getRevenueList());
    setKpis(getKPIList());
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 获取飞书数据
  const fetchFeishuData = useCallback(async (month: string, brand: string) => {
    if (!month) return;
    setFeishuLoading(true);
    try {
      const brandParam = brand === 'iqoo' ? 'iQOO' : brand === 'iot' ? 'IOT' : brand === 'all' ? 'all' : brand;
      const res = await fetch(`/api/cost-overview?month=${month}&brand=${brandParam}`);
      const data = await res.json();
      if (data.success) {
        setFeishuData(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch cost data:', error);
    } finally {
      setFeishuLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedMonth) {
      fetchFeishuData(selectedMonth, activeBrand);
    }
  }, [selectedMonth, activeBrand, fetchFeishuData]);

  // 利润数据
  const profitData = useMemo(() => {
    const localStorageProfit = activeBrand === 'all'
      ? BRANDS.reduce((acc, b) => {
          const brandData = calcProfitRate(b.id, selectedMonth);
          return {
            revenue: acc.revenue + brandData.revenue,
            totalCost: acc.totalCost + brandData.totalCost,
            profitRate: 0,
            costs: { ...acc.costs, ...brandData.costs },
            kpiDeducted: acc.kpiDeducted || brandData.kpiDeducted,
          };
        }, { revenue: 0, totalCost: 0, profitRate: 0, costs: {} as Record<string, number>, kpiDeducted: false })
      : calcProfitRate(activeBrand, selectedMonth);

    const feishuTotalCost = feishuData?.totalCost ?? 0;
    const effectiveCost = feishuData ? feishuTotalCost : localStorageProfit.totalCost;
    const effectiveRevenue = localStorageProfit.revenue;
    const effectiveProfitRate = effectiveRevenue > 0
      ? (effectiveRevenue - effectiveCost) / effectiveRevenue
      : 0;

    return {
      revenue: effectiveRevenue,
      totalCost: effectiveCost,
      profitRate: effectiveProfitRate,
      grossProfit: effectiveRevenue - effectiveCost,
      kpiDeducted: localStorageProfit.kpiDeducted,
    };
  }, [activeBrand, selectedMonth, feishuData]);

  // 品牌收入过滤
  const brandRevenues = useMemo(
    () => revenues.filter((r) => (activeBrand === 'all' || r.brandId === activeBrand) && r.month === selectedMonth),
    [revenues, activeBrand, selectedMonth],
  );

  // 成本分类计算
  const categoryData = useMemo(() => {
    if (!feishuData) return [];
    const dims = feishuData.dimensions;
    const totalCost = feishuData.totalCost || 1;

    const items = COST_CATEGORIES.map((cat) => {
      const config = CATEGORY_CONFIG[cat];
      let cost = 0;
      let count = 0;

      if (config.dimKey === 'anchor') {
        cost = dims.anchor.total;
        count = dims.anchor.details.length;
      } else if (config.dimKey === 'control') {
        cost = dims.control.total;
        count = dims.control.details.length;
      } else if (config.dimKey === 'fulltime' && config.role) {
        const details = dims.fulltime.details.filter((d) => d.role === config.role);
        cost = details.reduce((s, d) => s + d.cost, 0);
        count = details.length;
      } else if (config.dimKey === 'purchase') {
        cost = dims.purchase.total;
        count = dims.purchase.details.length;
      }

      return {
        key: cat,
        label: config.label,
        cost,
        count,
        ratio: cost / totalCost,
        config,
      };
    });

    return items;
  }, [feishuData]);

  // 表格数据
  const tableRows = useMemo((): TableRow[] => {
    if (!feishuData) return [];
    const rows: TableRow[] = [];

    feishuData.dimensions.anchor.details.forEach((d, i) => {
      rows.push({
        id: `anchor-${i}`,
        category: '兼职主播成本',
        name: d.name,
        amount: d.cost,
        remark: d.remark || (d.hours ? `${d.hours}h × ¥${d.rate || 0}/h` : ''),
      });
    });

    feishuData.dimensions.control.details.forEach((d, i) => {
      rows.push({
        id: `control-${i}`,
        category: '兼职中控成本',
        name: d.name,
        amount: d.cost,
        remark: d.remark || '',
      });
    });

    feishuData.dimensions.fulltime.details.forEach((d, i) => {
      const cat = d.role === '主播' ? '全职主播成本' : '全职中控成本';
      rows.push({
        id: `fulltime-${i}`,
        category: cat,
        name: d.name,
        amount: d.cost,
        remark: d.remark || '',
      });
    });

    (feishuData.dimensions.purchase.details as Array<{ name?: string; amount?: number; date?: string }>).forEach((d, i) => {
      rows.push({
        id: `purchase-${i}`,
        category: '日常物料成本',
        name: d.name || d.date || '物料采买',
        amount: d.amount || 0,
        remark: '',
      });
    });

    return rows.sort((a, b) => b.amount - a.amount);
  }, [feishuData]);

  // 过滤后的表格数据
  const filteredRows = useMemo(() => {
    let rows = tableRows;
    if (categoryFilter !== 'all') {
      rows = rows.filter((r) => r.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      rows = rows.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.remark.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [tableRows, categoryFilter, searchQuery]);

  // KPI过滤
  const brandKPIs = useMemo(() => {
    return kpis.filter((k) => {
      if (activeBrand === 'all') return true;
      return k.brandId === activeBrand;
    }).filter((k) => {
      if (!selectedMonth) return true;
      return k.month === selectedMonth;
    });
  }, [kpis, activeBrand, selectedMonth]);

  // 导出CSV
  const exportCSV = useCallback(() => {
    const headers = ['类别', '姓名', '金额', '占比', '备注'];
    const total = feishuData?.totalCost || 1;
    const csvRows = filteredRows.map((r) => [
      r.category,
      r.name,
      r.amount,
      `${(r.amount / total * 100).toFixed(1)}%`,
      r.remark,
    ]);
    const csvContent = [headers, ...csvRows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `成本明细_${selectedMonth || 'export'}_${activeBrand}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredRows, selectedMonth, activeBrand, feishuData]);

  // 成本占比
  const costRatio = profitData.revenue > 0 ? (profitData.totalCost / profitData.revenue * 100).toFixed(0) : '0';

  // 加载骨架
  if (!isClient || !selectedMonth || !startDate) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#0B0F19' }}>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-8 w-40 rounded" style={{ backgroundColor: '#1f2937' }} />
              <div className="h-4 w-60 rounded mt-2" style={{ backgroundColor: '#1f2937' }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 rounded-xl animate-pulse" style={{ backgroundColor: '#111827' }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const profitIsPositive = profitData.profitRate >= 0;
  const grossProfit = profitData.grossProfit;

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-6" style={{ backgroundColor: '#0B0F19', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
      {/* ===== 1. 顶部筛选栏 ===== */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#E5E7EB' }}>成本核算</h1>
            <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>六大成本项、收入计算、KPI 扣减与利润率分析</p>
          </div>
          {/* 权限标签 */}
          <span
            className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-2xl"
            style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: '#10B981' }}
          >
            🛡 完整数据视图
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* 日期范围 */}
          <span className="text-sm" style={{ color: '#9CA3AF' }}>
            {formatDisplayDate(startDate)} ~ {formatDisplayDate(endDate)}
          </span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-transparent border rounded-lg px-3 py-1.5 text-sm focus:outline-none"
            style={{ borderColor: '#374151', color: '#E5E7EB' }}
          />
          <span style={{ color: '#4B5563' }}>~</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-transparent border rounded-lg px-3 py-1.5 text-sm focus:outline-none"
            style={{ borderColor: '#374151', color: '#E5E7EB' }}
          />
          {/* 快捷按钮 */}
          <button
            onClick={() => {
              setStartDate(getDaysAgo(6));
              setEndDate(getToday());
            }}
            className="px-3 py-1.5 text-xs rounded-lg border transition"
            style={{ borderColor: '#374151', color: '#9CA3AF' }}
          >
            近7天
          </button>
          <button
            onClick={() => {
              const range = getMonthRange(safeMonth);
              setStartDate(range.start);
              setEndDate(range.end);
            }}
            className="px-3 py-1.5 text-xs rounded-lg border transition"
            style={{ borderColor: '#374151', color: '#9CA3AF' }}
          >
            本月
          </button>
          {/* 刷新 */}
          <button
            onClick={() => {
              if (selectedMonth) {
                fetchFeishuData(selectedMonth, activeBrand);
                loadData();
              }
            }}
            className="p-2 rounded-lg border transition hover:opacity-80"
            style={{ borderColor: brandColor, color: brandColor }}
            title="刷新数据"
          >
            <RefreshCw className={cn("w-4 h-4", feishuLoading && "animate-spin")} />
          </button>
          {/* 品牌切换 */}
          <div className="flex items-center gap-1 ml-2">
            {[
              { id: 'all', name: '全部', color: '#4158D0' },
              ...BRANDS.map((b) => ({
                id: b.id,
                name: b.name,
                color: BRAND_COLORS[b.id] || '#4158D0',
              })),
            ].map((b) => (
              <button
                key={b.id}
                onClick={() => setActiveBrand(b.id)}
                className="px-3 py-1.5 text-xs rounded-lg border transition-all"
                style={
                  activeBrand === b.id
                    ? { backgroundColor: b.color + '20', color: b.color, borderColor: b.color + '40' }
                    : { borderColor: '#374151', color: '#9CA3AF' }
                }
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== 2. 汇总指标卡片（2×2） ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 卡片1：总成本（主指标，左上） */}
        <div
          className="relative rounded-xl p-6 transition-all duration-200 hover:-translate-y-0.5"
          style={{
            background: `linear-gradient(135deg, rgba(65,88,208,0.08) 0%, transparent 100%)`,
            border: `1px solid rgba(65,88,208,0.2)`,
            backgroundColor: '#111827',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1a2236'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#111827'; }}
        >
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: brandColor }} />
          <p className="text-xs mb-1" style={{ color: '#9CA3AF', letterSpacing: '2px' }}>总成本</p>
          <p className="font-bold" style={{ color: '#E5E7EB', fontSize: '38px', fontWeight: 700, fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace' }}>
            {formatCurrency(profitData.totalCost)}
          </p>
          <p className="text-xs mt-2" style={{ color: '#9CA3AF' }}>
            成本占比 {costRatio}%
          </p>
        </div>

        {/* 卡片2：毛利（主指标，右上） */}
        <div
          className="relative rounded-xl p-6 transition-all duration-200 hover:-translate-y-0.5"
          style={{
            background: `linear-gradient(135deg, rgba(239,68,68,0.08) 0%, transparent 100%)`,
            border: `1px solid rgba(239,68,68,0.2)`,
            backgroundColor: '#111827',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1a2236'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#111827'; }}
        >
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: '#EF4444' }} />
          <p className="text-xs mb-1" style={{ color: '#9CA3AF', letterSpacing: '2px' }}>毛利</p>
          <p className="font-bold" style={{ color: grossProfit >= 0 ? '#10B981' : '#EF4444', fontSize: '38px', fontWeight: 700, fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace' }}>
            {formatCurrency(grossProfit)}
          </p>
          <p className="text-xs mt-2" style={{ color: '#6B7280' }}>
            利润率 = (收入 - 成本) / 收入
          </p>
        </div>

        {/* 卡片3：利润率（辅助指标，左下） */}
        <div
          className="rounded-xl p-6 transition-all duration-200 hover:-translate-y-0.5"
          style={{ backgroundColor: '#111827', border: '1px solid #1F2937' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1a2236'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#111827'; }}
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xl">📊</span>
            <p className="text-2xl font-semibold" style={{ color: profitIsPositive ? '#10B981' : '#EF4444', fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace' }}>
              {(profitData.profitRate * 100).toFixed(1)}%
            </p>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: profitIsPositive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                color: profitIsPositive ? '#10B981' : '#EF4444',
              }}
            >
              {profitIsPositive ? '盈利' : '亏损'}
            </span>
          </div>
          <p className="text-xs" style={{ color: '#6B7280' }}>
            {profitData.revenue === 0 ? '当前周期无收入，成本全为支出' : `利润率 ${(profitData.profitRate * 100).toFixed(1)}%`}
            {profitData.kpiDeducted && '（含KPI扣减5%）'}
          </p>
        </div>

        {/* 卡片4：品牌服务费收入（辅助指标，右下） */}
        <div
          className="rounded-xl p-6 transition-all duration-200 hover:-translate-y-0.5"
          style={{ backgroundColor: '#111827', border: '1px solid #1F2937' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1a2236'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#111827'; }}
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xl">💰</span>
            <p className="text-2xl font-semibold" style={{ color: brandRevenues.length > 0 ? '#E5E7EB' : '#9CA3AF', fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace' }}>
              {formatCurrency(profitData.revenue)}
            </p>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(107,114,128,0.15)', color: '#6B7280' }}>
              {brandRevenues.length} 条记录
            </span>
          </div>
          <p className="text-xs" style={{ color: '#6B7280' }}>
            {brandRevenues.length === 0 ? '暂无品牌服务费收入数据' : `品牌服务费收入 ${formatCurrency(profitData.revenue)}`}
          </p>
        </div>
      </div>

      {/* ===== 3. Tab 切换栏 ===== */}
      <div className="relative">
        <div className="flex items-center gap-6 border-b" style={{ borderColor: '#1f2937' }}>
          {([
            { id: 'cost' as const, label: '成本明细' },
            { id: 'revenue' as const, label: '收入明细' },
            { id: 'kpi' as const, label: 'KPI管理' },
            { id: 'profit' as const, label: '利润率看板' },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative px-2 py-3 text-sm font-medium transition-colors duration-150"
              style={{ color: activeTab === tab.id ? '#E5E7EB' : '#6B7280' }}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ backgroundColor: brandColor }}
                />
              )}
            </button>
          ))}
        </div>

        {/* ===== 成本明细 Tab ===== */}
        {activeTab === 'cost' && (
          <div className="mt-6 space-y-6">
            {/* 成本可视化区（双栏） */}
            {feishuData && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* 左栏：SVG 环形图 */}
                <div
                  className="lg:col-span-2 rounded-xl p-6 flex flex-col items-center justify-center"
                  style={{ backgroundColor: '#111827', border: '1px solid #1f2937' }}
                >
                  <DonutChart data={categoryData} total={feishuData.totalCost} />
                </div>

                {/* 右栏：2×3 成本分类卡片网格 */}
                <div className="lg:col-span-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {categoryData.map((item) => (
                      <CategoryCard key={item.key} item={item} total={feishuData.totalCost} brandColor={brandColor} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 加载状态 */}
            {feishuLoading && !feishuData && (
              <div className="flex items-center justify-center py-12">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-5 h-5 animate-spin" style={{ color: brandColor }} />
                  <span className="text-sm" style={{ color: '#9CA3AF' }}>正在加载成本数据...</span>
                </div>
              </div>
            )}

            {/* 成本明细表格 */}
            <div>
              {/* 工具栏 */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#6B7280' }} />
                  <input
                    type="text"
                    placeholder="搜索姓名..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border focus:outline-none"
                    style={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#E5E7EB', borderRadius: '8px' }}
                  />
                </div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border focus:outline-none"
                  style={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#E5E7EB' }}
                >
                  <option value="all">全部类别</option>
                  {COST_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_CONFIG[cat].label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg font-medium transition hover:brightness-110"
                  style={{ backgroundColor: brandColor, color: '#fff' }}
                >
                  <Download className="w-4 h-4" />
                  导出 CSV
                </button>
              </div>

              {/* 表格 */}
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#1f2937' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: '#111827' }}>
                        <th scope="col" className="p-3 text-left text-xs font-medium w-[160px]" style={{ color: '#6B7280' }}>类别</th>
                        <th scope="col" className="p-3 text-left text-xs font-medium" style={{ color: '#6B7280' }}>姓名</th>
                        <th scope="col" className="p-3 text-right text-xs font-medium w-[140px]" style={{ color: '#6B7280' }}>金额</th>
                        <th scope="col" className="p-3 text-right text-xs font-medium w-[80px]" style={{ color: '#6B7280' }}>占比</th>
                        <th scope="col" className="p-3 text-left text-xs font-medium" style={{ color: '#6B7280' }}>备注</th>
                        <th scope="col" className="p-3 text-center text-xs font-medium w-[100px]" style={{ color: '#6B7280' }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-12 text-sm" style={{ color: '#6B7280' }}>
                            暂无成本数据
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row) => {
                          const config = CATEGORY_CONFIG[row.category];
                          const ratio = feishuData?.totalCost
                            ? (row.amount / feishuData.totalCost * 100)
                            : 0;
                          return (
                            <tr
                              key={row.id}
                              className="border-t transition"
                              style={{ borderColor: '#1f2937' }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                              <td className="p-3">
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                                  style={{ backgroundColor: config.tagBg, color: config.tagText }}
                                >
                                  {config.label}
                                </span>
                              </td>
                              <td className="p-3 font-medium" style={{ color: '#E5E7EB', fontSize: '14px' }}>
                                {row.name}
                              </td>
                              <td
                                className="p-3 text-right font-medium"
                                style={{ color: '#E5E7EB', fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace' }}
                              >
                                {formatCurrency(row.amount)}
                              </td>
                              <td
                                className="p-3 text-right text-xs"
                                style={{ color: '#9CA3AF', fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace' }}
                              >
                                {ratio.toFixed(1)}%
                              </td>
                              <td className="p-3 text-xs" style={{ color: '#9CA3AF' }}>
                                {row.remark || '—'}
                              </td>
                              <td className="p-3 text-center">
                                <a
                                  href="https://feishu.cn"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all duration-200"
                                  style={{
                                    color: brandColor,
                                    borderColor: brandColor + '60',
                                    backgroundColor: 'transparent',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = brandColor + '15';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                  }}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  飞书
                                </a>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {/* 分页 */}
                {filteredRows.length > 0 && (
                  <div
                    className="flex items-center justify-between px-4 py-3 border-t"
                    style={{ backgroundColor: '#111827', borderColor: '#1f2937' }}
                  >
                    <span className="text-xs" style={{ color: '#6B7280' }}>
                      共 {filteredRows.length} 条 · 第 1/1 页
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== 收入明细 Tab ===== */}
        {activeTab === 'revenue' && (
          <div className="mt-6">
            {/* 工具栏 */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#6B7280' }} />
                <input
                  type="text"
                  placeholder="搜索..."
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border focus:outline-none"
                  style={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#E5E7EB' }}
                />
              </div>
              <button
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg font-medium transition hover:brightness-110"
                style={{ backgroundColor: brandColor, color: '#fff' }}
              >
                <Download className="w-4 h-4" />
                导出 CSV
              </button>
            </div>

            {/* 空状态 */}
            <div
              className="flex flex-col items-center justify-center py-20 rounded-xl"
              style={{ backgroundColor: '#111827', border: '1px solid #1f2937' }}
            >
              <span className="text-5xl mb-4">📭</span>
              <p className="text-base font-medium mb-1" style={{ color: '#9CA3AF' }}>暂无收入记录</p>
              <p className="text-xs" style={{ color: '#6B7280' }}>当前筛选条件下没有品牌服务费收入数据</p>
            </div>
          </div>
        )}

        {/* ===== KPI 管理 Tab ===== */}
        {activeTab === 'kpi' && (
          <KPITab
            kpis={brandKPIs}
            brandColor={brandColor}
            onToggleDeduction={(kpi) => {
              const updated = { ...kpi, isDeducted: !kpi.isDeducted };
              updateKPIItem(updated);
              setKpis(getKPIList());
            }}
          />
        )}

        {/* ===== 利润率看板 Tab ===== */}
        {activeTab === 'profit' && (
          <div className="mt-6">
            <div
              className="flex flex-col items-center justify-center py-20 rounded-xl"
              style={{ backgroundColor: '#111827', border: '1px solid #1f2937' }}
            >
              <span className="text-5xl mb-4">📊</span>
              <p className="text-base font-medium mb-1" style={{ color: '#9CA3AF' }}>利润率看板</p>
              <p className="text-xs" style={{ color: '#6B7280' }}>功能开发中...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== SVG 环形图 ====================
function DonutChart({
  data,
  total,
}: {
  data: Array<{ key: string; label: string; cost: number; config: (typeof CATEGORY_CONFIG)[string] }>;
  total: number;
}) {
  const validData = data.filter((d) => d.cost > 0);
  const cx = 100;
  const cy = 100;
  const outerR = 85;
  const innerR = 55;

  let startAngle = -Math.PI / 2;

  const segments = validData.map((item) => {
    const angle = total > 0 ? (item.cost / total) * Math.PI * 2 : 0;
    const endAngle = startAngle + angle;

    const x1o = cx + outerR * Math.cos(startAngle);
    const y1o = cy + outerR * Math.sin(startAngle);
    const x2o = cx + outerR * Math.cos(endAngle);
    const y2o = cy + outerR * Math.sin(endAngle);
    const x1i = cx + innerR * Math.cos(endAngle);
    const y1i = cy + innerR * Math.sin(endAngle);
    const x2i = cx + innerR * Math.cos(startAngle);
    const y2i = cy + innerR * Math.sin(startAngle);

    const largeArc = angle > Math.PI ? 1 : 0;

    const d = [
      `M${x1o},${y1o}`,
      `A${outerR},${outerR} 0 ${largeArc} 1 ${x2o},${y2o}`,
      `L${x1i},${y1i}`,
      `A${innerR},${innerR} 0 ${largeArc} 0 ${x2i},${y2i}`,
      'Z',
    ].join(' ');

    const result = { d, color: item.config.text, label: item.label, cost: item.cost, key: item.key };
    startAngle = endAngle;
    return result;
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width="200" height="200" viewBox="0 0 200 200">
        {segments.map((seg, i) => (
          <path key={i} d={seg.d} fill={seg.color} opacity="0.85" />
        ))}
        <text x={cx} y={cy - 8} textAnchor="middle" fill="#E5E7EB" fontSize="14" fontWeight="bold" fontFamily='"SF Mono", "Fira Code", monospace'>
          {formatCurrency(total)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#6B7280" fontSize="10">
          总成本
        </text>
      </svg>
      {/* 图例 */}
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
        {validData.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-xs" style={{ color: '#9CA3AF' }}>
              {item.label}
            </span>
            <span className="text-xs" style={{ color: '#E5E7EB' }}>
              {total > 0 ? ((item.cost / total) * 100).toFixed(0) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== 成本分类卡片 ====================
function CategoryCard({
  item,
  total,
  brandColor,
}: {
  item: { key: string; label: string; cost: number; count: number; ratio: number; config: (typeof CATEGORY_CONFIG)[string] };
  total: number;
  brandColor: string;
}) {
  const isZero = item.cost === 0;
  const pct = total > 0 ? (item.cost / total) * 100 : 0;

  return (
    <div
      className="rounded-xl p-4 transition-all duration-200 hover:-translate-y-0.5"
      style={{
        backgroundColor: '#111827',
        border: `1px solid ${isZero ? '#1f2937' : item.config.text + '30'}`,
        opacity: isZero ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#1a2236';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '#111827';
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="p-1.5 rounded-lg"
            style={{ backgroundColor: item.config.bg, color: item.config.text }}
          >
            {item.config.icon}
          </div>
          <span className="text-sm" style={{ color: '#9CA3AF' }}>
            {item.label}
          </span>
        </div>
      </div>
      <div
        className="text-2xl font-bold mb-1"
        style={{ color: isZero ? '#4B5563' : '#E5E7EB', fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace' }}
      >
        {isZero ? '—' : formatCurrency(item.cost)}
      </div>
      <div className="text-xs mb-3" style={{ color: '#9CA3AF' }}>
        {isZero ? '' : `${item.count} 人`}
      </div>
      {/* 进度条 */}
      {!isZero && (
        <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: '#1f2937' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(pct, 100)}%`,
              backgroundColor: brandColor,
            }}
          />
        </div>
      )}
      {isZero && (
        <p className="text-xs" style={{ color: '#4B5563' }}>暂无数据</p>
      )}
    </div>
  );
}

// ==================== KPI 管理 Tab ====================
const KPITab = memo(function KPITab({
  kpis,
  brandColor,
  onToggleDeduction,
}: {
  kpis: KPIItem[];
  brandColor: string;
  onToggleDeduction: (kpi: KPIItem) => void;
}) {
  const allAccounts = BRANDS.flatMap((b) => b.accounts);

  if (kpis.length === 0) {
    return (
      <div className="mt-6">
        <div
          className="flex flex-col items-center justify-center py-20 rounded-xl"
          style={{ backgroundColor: '#111827', border: '1px solid #1f2937' }}
        >
          <span className="text-5xl mb-4">📋</span>
          <p className="text-base font-medium mb-1" style={{ color: '#9CA3AF' }}>KPI 管理模块</p>
          <p className="text-xs" style={{ color: '#6B7280' }}>功能开发中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {kpis.map((kpi) => {
        const account = allAccounts.find((a) => a.id === kpi.accountId);
        const metrics = [
          { label: '曝光进入率(人数)', actual: kpi.metrics.exposureEnterRate, target: kpi.targetMetrics.exposureEnterRate, unit: '%' },
          { label: '曝光进入率(次数)', actual: kpi.metrics.exposureEnterRateCount, target: kpi.targetMetrics.exposureEnterRateCount, unit: '%' },
          { label: 'GPM', actual: kpi.metrics.gpm, target: kpi.targetMetrics.gpm, unit: '' },
          { label: '停留时长', actual: kpi.metrics.avgStayDuration, target: kpi.targetMetrics.avgStayDuration, unit: 's' },
          { label: '转粉率', actual: kpi.metrics.followRate, target: kpi.targetMetrics.followRate, unit: '%' },
        ];

        return (
          <div
            key={kpi.id}
            className="rounded-xl p-5"
            style={{ backgroundColor: '#111827', border: '1px solid #1f2937' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium" style={{ color: '#E5E7EB' }}>
                  {account?.name || kpi.accountId}
                </span>
                {kpi.isDeducted ? (
                  <span
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444' }}
                  >
                    <XCircle className="w-3 h-3" />
                    KPI未达标 扣减5%
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: '#10B981' }}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    KPI达标
                  </span>
                )}
              </div>
              <button
                onClick={() => onToggleDeduction(kpi)}
                className="text-xs px-3 py-1.5 rounded-lg border transition hover:opacity-80"
                style={{ borderColor: '#374151', color: '#9CA3AF' }}
              >
                切换达标状态
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {metrics.map((m) => {
                const passed = m.actual >= m.target;
                const ratio = m.target > 0 ? (m.actual / m.target) * 100 : 0;
                return (
                  <div
                    key={m.label}
                    className="rounded-lg p-3 text-center"
                    style={{ backgroundColor: '#0B0F19' }}
                  >
                    <p className="text-[10px] mb-1" style={{ color: '#6B7280' }}>{m.label}</p>
                    <p
                      className="text-lg font-bold"
                      style={{ color: passed ? '#10B981' : '#EF4444' }}
                    >
                      {m.actual}{m.unit}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#4B5563' }}>
                      目标 {m.target}{m.unit}
                    </p>
                    <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ backgroundColor: '#1f2937' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(ratio, 100)}%`,
                          backgroundColor: passed ? '#10B981' : '#EF4444',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
});
