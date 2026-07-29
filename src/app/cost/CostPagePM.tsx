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
    icon: null,
    bg: 'rgba(65,88,208,0.15)',
    text: '#4158D0',
    tagBg: 'rgba(65,88,208,0.15)',
    tagText: '#4158D0',
    dimKey: 'anchor',
  },
  '兼职中控成本': {
    label: '兼职中控',
    icon: null,
    bg: 'rgba(123,97,255,0.15)',
    text: '#7B61FF',
    tagBg: 'rgba(123,97,255,0.15)',
    tagText: '#7B61FF',
    dimKey: 'control',
  },
  '全职主播成本': {
    label: '全职主播',
    icon: null,
    bg: 'rgba(65,88,208,0.1)',
    text: '#6B7FE8',
    tagBg: 'rgba(65,88,208,0.1)',
    tagText: '#6B7FE8',
    dimKey: 'fulltime',
    role: '主播',
  },
  '全职中控成本': {
    label: '全职中控',
    icon: null,
    bg: 'rgba(123,97,255,0.1)',
    text: '#9B85FF',
    tagBg: 'rgba(123,97,255,0.1)',
    tagText: '#9B85FF',
    dimKey: 'fulltime',
    role: '中控',
  },
  '日常物料成本': {
    label: '日常物料',
    icon: null,
    bg: 'rgba(107,114,128,0.15)',
    text: '#6B7280',
    tagBg: 'rgba(107,114,128,0.15)',
    tagText: '#6B7280',
    dimKey: 'purchase',
  },
  '其它成本': {
    label: '其它',
    icon: null,
    bg: 'rgba(107,114,128,0.1)',
    text: '#6B7280',
    tagBg: 'rgba(107,114,128,0.1)',
    tagText: '#6B7280',
  },
};

// SVG 图标组件
function PersonIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="6" r="3.5" stroke={color} strokeWidth="1.8" fill="none" />
      <path d="M4 18c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function MonitorIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="3" width="16" height="10" rx="1.5" stroke={color} strokeWidth="1.8" fill="none" />
      <line x1="7" y1="17" x2="13" y2="17" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <line x1="10" y1="13" x2="10" y2="17" stroke={color} strokeWidth="1.8" />
    </svg>
  );
}

function BoxIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 6l7-4 7 4v8l-7 4-7-4V6z" stroke={color} strokeWidth="1.8" fill="none" strokeLinejoin="round" />
      <path d="M3 6l7 4 7-4" stroke={color} strokeWidth="1.8" fill="none" strokeLinejoin="round" />
      <line x1="10" y1="10" x2="10" y2="18" stroke={color} strokeWidth="1.8" />
    </svg>
  );
}

function DocumentIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M5 2h7l5 5v11a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" stroke={color} strokeWidth="1.8" fill="none" strokeLinejoin="round" />
      <path d="M12 2v5h5" stroke={color} strokeWidth="1.8" fill="none" strokeLinejoin="round" />
      <line x1="7" y1="11" x2="13" y2="11" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="7" y1="14" x2="11" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// 分类图标映射
const CATEGORY_ICONS: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  '兼职主播成本': { icon: <PersonIcon color="#4158D0" />, color: '#4158D0', bg: 'rgba(65,88,208,0.15)' },
  '兼职中控成本': { icon: <MonitorIcon color="#7B61FF" />, color: '#7B61FF', bg: 'rgba(123,97,255,0.15)' },
  '全职主播成本': { icon: <PersonIcon color="#6B7FE8" />, color: '#6B7FE8', bg: 'rgba(65,88,208,0.1)' },
  '全职中控成本': { icon: <MonitorIcon color="#9B85FF" />, color: '#9B85FF', bg: 'rgba(123,97,255,0.1)' },
  '日常物料成本': { icon: <BoxIcon color="#6B7280" />, color: '#6B7280', bg: 'rgba(107,114,128,0.15)' },
  '其它成本': { icon: <DocumentIcon color="#6B7280" />, color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
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
  if (n < 0) return `-¥${Math.abs(n).toLocaleString('zh-CN')}`;
  return `¥${n.toLocaleString('zh-CN')}`;
}

function formatSignedCurrency(n: number): string {
  if (n < 0) return `-¥${Math.abs(n).toLocaleString('zh-CN')}`;
  if (n > 0) return `¥${n.toLocaleString('zh-CN')}`;
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
          <div className="grid grid-cols-4 gap-4">
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
  const profitRatePct = (profitData.profitRate * 100).toFixed(1);

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-6" style={{ backgroundColor: '#0B0F19', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
      {/* ===== 1. 顶部筛选栏 ===== */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#E5E7EB' }}>成本核算</h1>
            <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>六大成本项、收入计算、KPI 扣减与利润率分析</p>
          </div>
          <span
            className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-2xl"
            style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: '#10B981' }}
          >
            🛡 完整数据视图
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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

      {/* ===== 2. 汇总指标卡片（1×4 横排） ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 卡片1：总成本 */}
        <div
          className="relative rounded-xl p-5 transition-all duration-200 hover:-translate-y-0.5"
          style={{
            background: `linear-gradient(135deg, rgba(65,88,208,0.08) 0%, transparent 100%)`,
            border: '1px solid rgba(65,88,208,0.2)',
            backgroundColor: '#111827',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1a2236'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#111827'; }}
        >
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: brandColor }} />
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(65,88,208,0.2)' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <text x="2" y="13" fill="#4158D0" fontSize="12" fontWeight="bold">$</text>
              </svg>
            </div>
            <span className="text-xs" style={{ color: '#9CA3AF', letterSpacing: '1px' }}>总成本</span>
          </div>
          <p className="font-bold mb-2" style={{ color: '#E5E7EB', fontSize: '32px', fontWeight: 700, fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace' }}>
            {formatCurrency(profitData.totalCost)}
          </p>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444' }}
            >
              成本占比 {costRatio}%
            </span>
            <span className="text-xs" style={{ color: '#9CA3AF' }}>较上月 +12.3%</span>
          </div>
        </div>

        {/* 卡片2：利润率 */}
        <div
          className="relative rounded-xl p-5 transition-all duration-200 hover:-translate-y-0.5"
          style={{
            backgroundColor: '#111827',
            border: '1px solid #1F2937',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1a2236'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#111827'; }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.2)' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <polyline points="2,12 5,8 8,10 14,4" stroke="#10B981" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-xs" style={{ color: '#9CA3AF', letterSpacing: '1px' }}>利润率</span>
          </div>
          <p className="font-bold mb-2" style={{ color: profitIsPositive ? '#10B981' : '#EF4444', fontSize: '32px', fontWeight: 700, fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace' }}>
            {profitRatePct}%
          </p>
          <span
            className="inline-flex items-center text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: profitIsPositive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: profitIsPositive ? '#10B981' : '#EF4444' }}
          >
            {profitIsPositive ? '↗盈利' : '↘亏损'}
          </span>
        </div>

        {/* 卡片3：品牌服务费收入 */}
        <div
          className="relative rounded-xl p-5 transition-all duration-200 hover:-translate-y-0.5"
          style={{
            backgroundColor: '#111827',
            border: '1px solid #1F2937',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1a2236'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#111827'; }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(123,97,255,0.2)' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="6" width="12" height="8" rx="1" stroke="#7B61FF" strokeWidth="1.5" fill="none" />
                <path d="M5 6V4a3 3 0 016 0v2" stroke="#7B61FF" strokeWidth="1.5" fill="none" />
              </svg>
            </div>
            <span className="text-xs" style={{ color: '#9CA3AF', letterSpacing: '1px' }}>品牌服务费收入</span>
          </div>
          <p className="font-bold mb-2" style={{ color: brandRevenues.length > 0 ? '#E5E7EB' : '#9CA3AF', fontSize: '32px', fontWeight: 700, fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace' }}>
            {formatCurrency(profitData.revenue)}
          </p>
          <span className="text-xs" style={{ color: '#6B7280' }}>
            {brandRevenues.length} 条记录
          </span>
        </div>

        {/* 卡片4：毛利 */}
        <div
          className="relative rounded-xl p-5 transition-all duration-200 hover:-translate-y-0.5"
          style={{
            background: `linear-gradient(135deg, rgba(239,68,68,0.08) 0%, transparent 100%)`,
            border: '1px solid rgba(239,68,68,0.2)',
            backgroundColor: '#111827',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1a2236'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#111827'; }}
        >
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: '#EF4444' }} />
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(239,68,68,0.2)' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <text x="2" y="13" fill="#EF4444" fontSize="12" fontWeight="bold">$</text>
              </svg>
            </div>
            <span className="text-xs" style={{ color: '#9CA3AF', letterSpacing: '1px' }}>毛利</span>
          </div>
          <p className="font-bold mb-2" style={{ color: grossProfit >= 0 ? '#10B981' : '#EF4444', fontSize: '32px', fontWeight: 700, fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace' }}>
            {formatSignedCurrency(grossProfit)}
          </p>
          <p className="text-xs" style={{ color: '#6B7280' }}>
            利润率 = (收入 - 成本) / 收入
          </p>
        </div>
      </div>

      {/* ===== 3. Tab 切换栏（带数字角标） ===== */}
      <div className="relative">
        <div className="flex items-center gap-6 border-b" style={{ borderColor: '#1f2937' }}>
          <button
            onClick={() => setActiveTab('cost')}
            className="relative px-2 py-3 text-sm transition-colors duration-150 flex items-center gap-2"
            style={{ color: activeTab === 'cost' ? '#E5E7EB' : '#6B7280', fontWeight: activeTab === 'cost' ? 700 : 400 }}
            role="tab"
            aria-selected={activeTab === 'cost'}
          >
            成本明细
            <span
              className="inline-flex items-center justify-center text-xs px-1.5 rounded-full min-w-[20px] h-5"
              style={{ backgroundColor: activeTab === 'cost' ? 'rgba(255,255,255,0.15)' : 'rgba(107,114,128,0.3)', color: activeTab === 'cost' ? '#E5E7EB' : '#9CA3AF', fontSize: '11px' }}
            >
              {tableRows.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('revenue')}
            className="relative px-2 py-3 text-sm transition-colors duration-150 flex items-center gap-2"
            style={{ color: activeTab === 'revenue' ? '#E5E7EB' : '#6B7280', fontWeight: activeTab === 'revenue' ? 700 : 400 }}
            role="tab"
            aria-selected={activeTab === 'revenue'}
          >
            收入明细
            <span
              className="inline-flex items-center justify-center text-xs px-1.5 rounded-full min-w-[20px] h-5"
              style={{ backgroundColor: activeTab === 'revenue' ? 'rgba(255,255,255,0.15)' : 'rgba(107,114,128,0.3)', color: activeTab === 'revenue' ? '#E5E7EB' : '#9CA3AF', fontSize: '11px' }}
            >
              {brandRevenues.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('kpi')}
            className="relative px-2 py-3 text-sm transition-colors duration-150"
            style={{ color: activeTab === 'kpi' ? '#E5E7EB' : '#6B7280', fontWeight: activeTab === 'kpi' ? 700 : 400 }}
            role="tab"
            aria-selected={activeTab === 'kpi'}
          >
            KPI管理
          </button>
          <button
            onClick={() => setActiveTab('profit')}
            className="relative px-2 py-3 text-sm transition-colors duration-150"
            style={{ color: activeTab === 'profit' ? '#E5E7EB' : '#6B7280', fontWeight: activeTab === 'profit' ? 700 : 400 }}
            role="tab"
            aria-selected={activeTab === 'profit'}
          >
            利润率看板
          </button>
        </div>

        {/* ===== 成本明细 Tab ===== */}
        {activeTab === 'cost' && (
          <div className="mt-6 space-y-6">
            {/* 成本可视化区（左65%右35%） */}
            {feishuData && (
              <div className="grid grid-cols-1 lg:grid-cols-[65fr_35fr] gap-4">
                {/* 左侧：3×2 成本分类卡片网格 */}
                <div>
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: '#E5E7EB' }}>
                    <span className="w-1 h-4 rounded-full" style={{ backgroundColor: brandColor }} />
                    成本分类统计
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {categoryData.map((item) => (
                      <CategoryCardV2 key={item.key} item={item} total={feishuData.totalCost} />
                    ))}
                  </div>
                </div>

                {/* 右侧：成本占比分布环形图 */}
                <DonutChartV2 data={categoryData} total={feishuData.totalCost} brandColor={brandColor} />
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
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#6B7280' }} />
                    <input
                      type="text"
                      placeholder="搜索姓名或类别..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border focus:outline-none"
                      style={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#E5E7EB' }}
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
                </div>
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg font-medium transition hover:brightness-110 border"
                  style={{ borderColor: '#374151', backgroundColor: 'transparent', color: '#E5E7EB' }}
                >
                  <Download className="w-4 h-4" />
                  导出
                </button>
              </div>

              {/* 表格 */}
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: '#1f2937' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: '#111827' }}>
                        <th scope="col" className="p-3 text-left text-xs font-medium" style={{ color: '#6B7280' }}>类别</th>
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
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_ICONS[row.category]?.color || '#6B7280' }} />
                                  <span className="text-xs font-medium" style={{ color: CATEGORY_ICONS[row.category]?.color || '#9CA3AF' }}>
                                    {config.label}成本
                                  </span>
                                </div>
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
                                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all duration-200"
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
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg font-medium transition hover:brightness-110 border"
                style={{ borderColor: '#374151', backgroundColor: 'transparent', color: '#E5E7EB' }}
              >
                <Download className="w-4 h-4" />
                导出
              </button>
            </div>

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

// ==================== 成本分类卡片 V2 ====================
function CategoryCardV2({
  item,
  total,
}: {
  item: { key: string; label: string; cost: number; count: number; ratio: number; config: (typeof CATEGORY_CONFIG)[string] };
  total: number;
}) {
  const isZero = item.cost === 0;
  const pct = total > 0 ? (item.cost / total) * 100 : 0;
  const iconInfo = CATEGORY_ICONS[item.key];

  return (
    <div
      className="rounded-xl p-4 transition-all duration-200 hover:-translate-y-0.5"
      style={{
        backgroundColor: '#111827',
        border: `1px solid ${isZero ? '#1f2937' : (iconInfo?.color || '#1f2937') + '30'}`,
        opacity: isZero ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1a2236'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#111827'; }}
    >
      {/* 图标 + 分类名称 + 人数 */}
      <div className="flex items-start gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: iconInfo?.bg || 'rgba(107,114,128,0.15)' }}
        >
          {iconInfo?.icon}
        </div>
        <div>
          <div className="text-sm font-medium" style={{ color: '#E5E7EB' }}>{item.label}</div>
          <div className="text-xs" style={{ color: '#9CA3AF' }}>
            {item.key === '日常物料成本' || item.key === '其它成本' ? `${item.count}项` : `${item.count}人`}
          </div>
        </div>
      </div>

      {/* 大金额数字 */}
      <div
        className="text-2xl font-bold mb-3"
        style={{ color: isZero ? '#4B5563' : '#E5E7EB', fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace' }}
      >
        {formatCurrency(item.cost)}
      </div>

      {/* 进度条 + 占比 */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#1f2937' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(pct, 100)}%`,
              backgroundColor: iconInfo?.color || '#6B7280',
            }}
          />
        </div>
        <div className="flex items-center gap-1 text-xs flex-shrink-0">
          <span style={{ color: '#9CA3AF' }}>占比</span>
          <span style={{ color: '#E5E7EB', fontFamily: '"SF Mono", "Fira Code", monospace', fontSize: '12px' }}>
            {pct > 0 ? pct.toFixed(1) : '0'}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ==================== SVG 环形图 V2 ====================
function DonutChartV2({
  data,
  total,
  brandColor,
}: {
  data: Array<{ key: string; label: string; cost: number; config: (typeof CATEGORY_CONFIG)[string] }>;
  total: number;
  brandColor: string;
}) {
  const validData = data.filter((d) => d.cost > 0);
  const cx = 100;
  const cy = 100;
  const outerR = 85;
  const innerR = 55;

  // 蓝色系渐变色
  const blueGradientColors = ['#1e3a8a', '#3b5bdb', '#4158D0', '#6B7FE8', '#9B85FF', '#C4B5FD'];

  let startAngle = -Math.PI / 2;

  const segments = validData.map((item, index) => {
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

    const color = blueGradientColors[index % blueGradientColors.length];
    const result = { d, color, label: item.label, cost: item.cost, key: item.key, pct: total > 0 ? (item.cost / total * 100).toFixed(1) : '0' };
    startAngle = endAngle;
    return result;
  });

  return (
    <div
      className="rounded-xl p-6 flex flex-col"
      style={{ backgroundColor: '#111827', border: '1px solid #1f2937' }}
    >
      {/* 标题 */}
      <h3 className="text-sm font-semibold mb-6 flex items-center gap-2" style={{ color: '#E5E7EB' }}>
        <span className="w-1 h-4 rounded-full" style={{ backgroundColor: brandColor }} />
        成本占比分布
      </h3>

      {/* 环形图 + 图例 */}
      <div className="flex items-center gap-6 flex-1">
        {/* 环形图 */}
        <div className="flex-shrink-0">
          <svg width="200" height="200" viewBox="0 0 200 200">
            {segments.map((seg, i) => (
              <path key={i} d={seg.d} fill={seg.color} />
            ))}
            <text x={cx} y={cy - 6} textAnchor="middle" fill="#E5E7EB" fontSize="16" fontWeight="bold" fontFamily='"SF Mono", "Fira Code", monospace'>
              {formatCurrency(total)}
            </text>
            <text x={cx} y={cy + 14} textAnchor="middle" fill="#6B7280" fontSize="11">
              总成本
            </text>
          </svg>
        </div>

        {/* 图例 */}
        <div className="flex flex-col gap-3">
          {segments.map((seg) => (
            <div key={seg.key} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-xs" style={{ color: '#9CA3AF' }}>{seg.label}</span>
              <span className="text-xs font-medium" style={{ color: '#E5E7EB' }}>{seg.pct}%</span>
            </div>
          ))}
        </div>
      </div>
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
          <span className="text-5xl mb-4"></span>
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
