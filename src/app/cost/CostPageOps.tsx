'use client';

import { useEffect, useState, useCallback, useMemo, memo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { BRANDS, COST_CATEGORIES } from '@/lib/constants';
import { getKPIList, updateKPIItem } from '@/lib/store';
import type { KPIItem } from '@/lib/types';
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
  '全职运营成本': {
    label: '全职运营',
    icon: <Users className="w-4 h-4" />,
    bg: 'rgba(16,185,129,0.1)',
    text: '#10B981',
    tagBg: 'rgba(16,185,129,0.1)',
    tagText: '#10B981',
    dimKey: 'fulltime',
    role: '运营',
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

// Mock 趋势数据（4周）
const MOCK_TREND = [
  { week: 'W1', value: 18200 },
  { week: 'W2', value: 21500 },
  { week: 'W3', value: 16800 },
  { week: 'W4', value: 16236 },
];

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
  source: string;
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

function getDayCount(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.floor((e.getTime() - s.getTime()) / 86400000) + 1);
}

// ==================== 主组件 ====================
export default function CostPageOps() {
  const { currentBrand, isClient } = useApp();
  const safeMonth = useSafeMonth();

  // 状态
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeBrand, setActiveBrand] = useState('all');
  const [feishuData, setFeishuData] = useState<FeishuData | null>(null);
  const [feishuLoading, setFeishuLoading] = useState(false);
  const [kpis, setKpis] = useState<KPIItem[]>([]);
  const [activeTab, setActiveTab] = useState<'cost' | 'kpi'>('cost');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const selectedMonth = useMemo(() => {
    if (!startDate) return '';
    return startDate.slice(0, 7);
  }, [startDate]);

  const brandColor = BRAND_COLORS[activeBrand] || '#4158D0';
  const dayCount = getDayCount(startDate, endDate);

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
      setActiveBrand(currentBrand === 'iqoo' ? 'iqoo' : currentBrand === 'iot' ? 'iot' : currentBrand);
    }
  }, [currentBrand]);

  // 加载KPI数据
  const loadKPIs = useCallback(() => {
    setKpis(getKPIList());
  }, []);

  useEffect(() => {
    loadKPIs();
  }, [loadKPIs]);

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

  // 成本分类计算
  const categoryData = useMemo(() => {
    if (!feishuData) return [];
    const dims = feishuData.dimensions;
    const totalCost = feishuData.totalCost || 1; // 避免除零

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
      // 其它成本默认为0

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

  // 总人数
  const totalPeople = useMemo(() => {
    return categoryData.reduce((s, c) => s + c.count, 0);
  }, [categoryData]);

  // 环比（简化：用 totalCost 与 mock 上期对比）
  const momChange = useMemo(() => {
    if (!feishuData) return 0;
    // 使用 mock 上期数据做简单环比
    const lastMonthCost = feishuData.totalCost * 0.92; // 模拟环比下降8%
    return ((feishuData.totalCost - lastMonthCost) / lastMonthCost) * 100;
  }, [feishuData]);

  // 表格数据
  const tableRows = useMemo((): TableRow[] => {
    if (!feishuData) return [];
    const rows: TableRow[] = [];

    // 兼职主播
    feishuData.dimensions.anchor.details.forEach((d, i) => {
      rows.push({
        id: `anchor-${i}`,
        category: '兼职主播成本',
        name: d.name,
        amount: d.cost,
        remark: d.remark || `${d.hours || 0}h × ¥${d.rate || 0}/h`,
        source: 'feishu',
      });
    });

    // 兼职中控
    feishuData.dimensions.control.details.forEach((d, i) => {
      rows.push({
        id: `control-${i}`,
        category: '兼职中控成本',
        name: d.name,
        amount: d.cost,
        remark: d.remark || '',
        source: 'feishu',
      });
    });

    // 全职
    feishuData.dimensions.fulltime.details.forEach((d, i) => {
      let cat = '全职中控成本';
      if (d.role === '主播') cat = '全职主播成本';
      else if (d.role === '运营') cat = '全职运营成本';
      rows.push({
        id: `fulltime-${i}`,
        category: cat,
        name: d.name,
        amount: d.cost,
        remark: d.remark || '',
        source: 'feishu',
      });
    });

    // 日常物料
    (feishuData.dimensions.purchase.details as Array<{ name?: string; amount?: number; date?: string }>).forEach((d, i) => {
      rows.push({
        id: `purchase-${i}`,
        category: '日常物料成本',
        name: d.name || d.date || '物料采买',
        amount: d.amount || 0,
        remark: d.date || '',
        source: 'feishu',
      });
    });

    return rows;
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

  // 全选状态
  const allSelected = filteredRows.length > 0 && filteredRows.every((r) => selectedRows.has(r.id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredRows.map((r) => r.id)));
    }
  }, [allSelected, filteredRows]);

  const toggleSelectRow = useCallback((id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // 导出CSV
  const exportCSV = useCallback(() => {
    const headers = ['类别', '姓名', '金额', '备注', '来源'];
    const csvRows = filteredRows.map((r) => [
      r.category,
      r.name,
      r.amount,
      r.remark,
      r.source,
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
  }, [filteredRows, selectedMonth, activeBrand]);

  // KPI品牌过滤
  const brandKPIs = useMemo(() => {
    return kpis.filter((k) => {
      if (activeBrand === 'all') return true;
      return k.brandId === activeBrand;
    }).filter((k) => {
      if (!selectedMonth) return true;
      return k.month === selectedMonth;
    });
  }, [kpis, activeBrand, selectedMonth]);

  // 加载状态骨架
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
          <div className="h-44 rounded-2xl animate-pulse" style={{ backgroundColor: '#111827' }} />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-28 rounded-xl animate-pulse" style={{ backgroundColor: '#111827' }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-6" style={{ backgroundColor: '#0B0F19' }}>
      {/* ===== 1. 顶部筛选栏 ===== */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#E5E7EB' }}>成本核算</h1>
          <p className="text-sm mt-1" style={{ color: '#9CA3AF' }}>六大成本项与KPI扣减分析</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* 快捷按钮 */}
          <button
            onClick={() => {
              setStartDate(getDaysAgo(6));
              setEndDate(getToday());
            }}
            className="px-3 py-1.5 text-xs rounded-lg border transition"
            style={{ borderColor: '#374151', color: '#9CA3AF', backgroundColor: 'transparent' }}
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
            style={{ borderColor: '#374151', color: '#9CA3AF', backgroundColor: 'transparent' }}
          >
            本月
          </button>
          {/* 日期选择 */}
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
          {/* 刷新按钮 */}
          <button
            onClick={() => {
              if (selectedMonth) fetchFeishuData(selectedMonth, activeBrand);
              loadKPIs();
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
                color: b.id === 'vivo' ? '#4158D0' : b.id === 'iqoo' ? '#7B61FF' : '#10B981',
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

      {/* ===== 2. 总成本 Hero 卡片 ===== */}
      <div
        className="relative rounded-2xl overflow-hidden p-6 md:p-8"
        style={{
          background: `linear-gradient(135deg, #111827 0%, ${brandColor}15 50%, #111827 100%)`,
          border: `1px solid ${brandColor}30`,
        }}
      >
        {/* 品牌色光晕 */}
        <div
          className="absolute top-0 right-0 w-96 h-96 rounded-full blur-[120px] opacity-20 pointer-events-none"
          style={{ backgroundColor: brandColor }}
        />
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* 左：总成本 */}
          <div>
            <p className="text-xs mb-1" style={{ color: '#9CA3AF' }}>总成本</p>
            <p className="font-bold" style={{ color: '#E5E7EB', fontSize: '52px', lineHeight: 1.1 }}>
              {formatCurrency(feishuData?.totalCost ?? 0)}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: momChange >= 0 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                  color: momChange >= 0 ? '#EF4444' : '#10B981',
                }}
              >
                {momChange >= 0 ? '↑' : '↓'} {Math.abs(momChange).toFixed(1)}%
              </span>
              <span className="text-xs" style={{ color: '#6B7280' }}>环比上月</span>
            </div>
          </div>

          {/* 中：统计信息 */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold" style={{ color: '#E5E7EB' }}>
                  {categoryData.filter((c) => c.cost > 0).length}
                </p>
                <p className="text-xs" style={{ color: '#6B7280' }}>成本分类</p>
              </div>
              <div className="w-px h-8" style={{ backgroundColor: '#374151' }} />
              <div className="text-center">
                <p className="text-2xl font-bold" style={{ color: '#E5E7EB' }}>
                  {totalPeople}
                </p>
                <p className="text-xs" style={{ color: '#6B7280' }}>人涉及</p>
              </div>
              <div className="w-px h-8" style={{ backgroundColor: '#374151' }} />
              <div className="text-center">
                <p className="text-2xl font-bold" style={{ color: '#E5E7EB' }}>
                  {dayCount}
                </p>
                <p className="text-xs" style={{ color: '#6B7280' }}>天周期</p>
              </div>
            </div>
            {/* 品牌成本分布小标签 */}
            {feishuData?.byBrand && Object.keys(feishuData.byBrand).length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {Object.entries(feishuData.byBrand).map(([brand, cost]) => (
                  <span
                    key={brand}
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: (BRAND_COLORS[brand.toLowerCase()] || '#6B7280') + '15',
                      color: BRAND_COLORS[brand.toLowerCase()] || '#6B7280',
                      border: `1px solid ${(BRAND_COLORS[brand.toLowerCase()] || '#6B7280')}30`,
                    }}
                  >
                    {brand} {formatCurrency(cost)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 右：迷你趋势折线图（SVG mock） */}
          <div>
            <p className="text-xs mb-2" style={{ color: '#6B7280' }}>近4周趋势</p>
            <MiniTrendChart data={MOCK_TREND} color={brandColor} />
          </div>
        </div>
      </div>

      {/* ===== 3. 成本可视化区（双栏） ===== */}
      {feishuData && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* 左栏：SVG 环形图 */}
          <div
            className="lg:col-span-2 rounded-2xl p-6 flex flex-col items-center justify-center"
            style={{ backgroundColor: '#111827', border: '1px solid #1f2937' }}
          >
            <DonutChart data={categoryData} brandColor={brandColor} total={feishuData.totalCost} />
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

      {/* 加载状态覆盖 */}
      {feishuLoading && !feishuData && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-5 h-5 animate-spin" style={{ color: brandColor }} />
            <span className="text-sm" style={{ color: '#9CA3AF' }}>正在加载成本数据...</span>
          </div>
        </div>
      )}

      {/* ===== 4. Tab 切换 ===== */}
      <div className="relative">
        <div className="flex items-center gap-1 border-b" style={{ borderColor: '#1f2937' }}>
          <button
            onClick={() => setActiveTab('cost')}
            className="relative px-4 py-3 text-sm font-medium transition"
            style={{ color: activeTab === 'cost' ? '#E5E7EB' : '#6B7280' }}
          >
            成本明细
            {activeTab === 'cost' && (
              <div
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                style={{ backgroundColor: brandColor }}
              />
            )}
          </button>
          <button
            onClick={() => setActiveTab('kpi')}
            className="relative px-4 py-3 text-sm font-medium transition"
            style={{ color: activeTab === 'kpi' ? '#E5E7EB' : '#6B7280' }}
          >
            KPI管理
            {activeTab === 'kpi' && (
              <div
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                style={{ backgroundColor: brandColor }}
              />
            )}
          </button>
        </div>

        {/* ===== 5. 成本明细 Tab ===== */}
        {activeTab === 'cost' && (
          <div className="mt-4 space-y-4">
            {/* 搜索/筛选/导出 */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {/* 搜索框 */}
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#6B7280' }} />
                <input
                  type="text"
                  placeholder="搜索姓名、类别..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border focus:outline-none"
                  style={{ backgroundColor: '#111827', borderColor: '#374151', color: '#E5E7EB' }}
                />
              </div>
              {/* 类别筛选 */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border focus:outline-none"
                style={{ backgroundColor: '#111827', borderColor: '#374151', color: '#E5E7EB' }}
              >
                <option value="all">全部类别</option>
                {COST_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_CONFIG[cat].label}
                  </option>
                ))}
              </select>
              {/* 导出按钮 */}
              <button
                onClick={exportCSV}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg font-medium transition hover:opacity-80"
                style={{ backgroundColor: brandColor, color: '#fff' }}
              >
                <Download className="w-4 h-4" />
                导出CSV
              </button>
            </div>

            {/* 表格 */}
            <div
              className="rounded-xl overflow-hidden border"
              style={{ borderColor: '#1f2937' }}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: '#111827' }}>
                      <th className="p-3 text-left w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="rounded border-gray-600"
                          style={{ accentColor: brandColor }}
                        />
                      </th>
                      <th className="p-3 text-left text-xs font-medium" style={{ color: '#6B7280' }}>类别</th>
                      <th className="p-3 text-left text-xs font-medium" style={{ color: '#6B7280' }}>姓名</th>
                      <th className="p-3 text-right text-xs font-medium" style={{ color: '#6B7280' }}>金额</th>
                      <th className="p-3 text-left text-xs font-medium hidden md:table-cell" style={{ color: '#6B7280' }}>占比</th>
                      <th className="p-3 text-left text-xs font-medium hidden lg:table-cell" style={{ color: '#6B7280' }}>备注</th>
                      <th className="p-3 text-center text-xs font-medium" style={{ color: '#6B7280' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-sm" style={{ color: '#6B7280' }}>
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
                            className="border-t transition hover:bg-white/[0.02]"
                            style={{ borderColor: '#1f2937' }}
                          >
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={selectedRows.has(row.id)}
                                onChange={() => toggleSelectRow(row.id)}
                                className="rounded border-gray-600"
                                style={{ accentColor: brandColor }}
                              />
                            </td>
                            <td className="p-3">
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                                style={{ backgroundColor: config.tagBg, color: config.tagText }}
                              >
                                {config.label}
                              </span>
                            </td>
                            <td className="p-3 font-medium" style={{ color: '#E5E7EB' }}>
                              {row.name}
                            </td>
                            <td className="p-3 text-right font-mono font-medium" style={{ color: '#E5E7EB' }}>
                              {formatCurrency(row.amount)}
                            </td>
                            <td className="p-3 hidden md:table-cell">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#1f2937' }}>
                                  <div
                                    className="h-full rounded-full"
                                    style={{ width: `${Math.min(ratio, 100)}%`, backgroundColor: config.text }}
                                  />
                                </div>
                                <span className="text-xs w-12 text-right" style={{ color: '#6B7280' }}>
                                  {ratio.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                            <td className="p-3 text-xs hidden lg:table-cell" style={{ color: '#6B7280' }}>
                              {row.remark || '—'}
                            </td>
                            <td className="p-3 text-center">
                              <a
                                href="https://feishu.cn"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded transition hover:opacity-80"
                                style={{ color: brandColor, backgroundColor: brandColor + '15' }}
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
              {/* 汇总行 */}
              {filteredRows.length > 0 && (
                <div
                  className="flex items-center justify-between px-4 py-3 border-t"
                  style={{ backgroundColor: '#111827', borderColor: '#1f2937' }}
                >
                  <span className="text-xs" style={{ color: '#6B7280' }}>
                    共 {filteredRows.length} 条记录
                    {selectedRows.size > 0 && ` · 已选 ${selectedRows.size} 条`}
                  </span>
                  <span className="text-sm font-bold" style={{ color: '#E5E7EB' }}>
                    合计 {formatCurrency(filteredRows.reduce((s, r) => s + r.amount, 0))}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== 6. KPI 管理 Tab ===== */}
        {activeTab === 'kpi' && (
          <KPITab
            kpis={brandKPIs}
            brandColor={brandColor}
            onToggleDeduction={(kpi) => {
              const updated = { ...kpi, isDeducted: !kpi.isDeducted };
              updateKPIItem(updated);
              loadKPIs();
            }}
          />
        )}
      </div>
    </div>
  );
}

// ==================== 迷你趋势折线图 ====================
function MiniTrendChart({ data, color }: { data: typeof MOCK_TREND; color: string }) {
  const width = 200;
  const height = 60;
  const padding = 4;

  const maxVal = Math.max(...data.map((d) => d.value));
  const minVal = Math.min(...data.map((d) => d.value)) * 0.8;
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => ({
    x: padding + (i / (data.length - 1)) * (width - padding * 2),
    y: height - padding - ((d.value - minVal) / range) * (height - padding * 2),
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaD = pathD + ` L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`;

  return (
    <svg width={width} height={height + 16} viewBox={`0 0 ${width} ${height + 16}`}>
      <defs>
        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#trendGrad)" />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill={color} />
          <circle cx={p.x} cy={p.y} r="1.5" fill="#111827" />
          <text x={p.x} y={height + 12} textAnchor="middle" fill="#6B7280" fontSize="10">
            {data[i].week}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ==================== SVG 环形图 ====================
function DonutChart({
  data,
  brandColor,
  total,
}: {
  data: Array<{ key: string; label: string; cost: number; config: (typeof CATEGORY_CONFIG)[string] }>;
  brandColor: string;
  total: number;
}) {
  const validData = data.filter((d) => d.cost > 0);
  const cx = 100;
  const cy = 100;
  const outerR = 85;
  const innerR = 55;

  let startAngle = -Math.PI / 2;

  const segments = validData.map((item) => {
    const angle = (item.cost / total) * Math.PI * 2;
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

    const result = { d, color: item.config.text, label: item.label, cost: item.cost };
    startAngle = endAngle;
    return result;
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width="200" height="200" viewBox="0 0 200 200">
        {segments.map((seg, i) => (
          <path key={i} d={seg.d} fill={seg.color} opacity="0.85" />
        ))}
        {/* 中心文字 */}
        <text x={cx} y={cy - 8} textAnchor="middle" fill="#E5E7EB" fontSize="14" fontWeight="bold">
          {formatCurrency(total)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#6B7280" fontSize="10">
          总成本
        </text>
      </svg>
      {/* 图例 */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {validData.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.config.text }} />
            <span className="text-xs" style={{ color: '#9CA3AF' }}>
              {item.label}
            </span>
            <span className="text-xs ml-auto" style={{ color: '#E5E7EB' }}>
              {((item.cost / total) * 100).toFixed(0)}%
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
      className="rounded-xl p-4 transition-all hover:scale-[1.01]"
      style={{
        backgroundColor: '#111827',
        border: `1px solid ${isZero ? '#1f2937' : item.config.text + '30'}`,
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
          <span className="text-sm font-medium" style={{ color: '#9CA3AF' }}>
            {item.label}
          </span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: item.config.tagBg, color: item.config.tagText }}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="text-xl font-bold mb-1" style={{ color: isZero ? '#4B5563' : '#E5E7EB' }}>
        {isZero ? '—' : formatCurrency(item.cost)}
      </div>
      <div className="text-xs mb-3" style={{ color: '#6B7280' }}>
        {isZero ? '暂无数据' : `${item.count} 人`}
      </div>
      {/* 进度条 */}
      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#1f2937' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(pct, 100)}%`,
            backgroundColor: isZero ? '#374151' : brandColor,
          }}
        />
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
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#1f2937' }}>
          <CheckCircle2 className="w-8 h-8" style={{ color: '#4B5563' }} />
        </div>
        <p className="text-sm" style={{ color: '#6B7280' }}>暂无KPI数据</p>
        <p className="text-xs mt-1" style={{ color: '#4B5563' }}>请在系统中录入KPI指标数据</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
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
            {/* 头部 */}
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

            {/* 指标网格 */}
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
                    {/* 微型进度条 */}
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
